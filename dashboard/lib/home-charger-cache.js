// 집충전기(환경공단 EvCharger) 캐시 모듈 — 핵심 워머 + TTL + 쿨다운 + 스냅샷.
// 각 statId별로 getChargerInfo?statId=XXX 호출 (전국 풀스캔 불필요, 쿼터 대폭 절감).
//
// 분리된 모듈:
//   - lib/home-charger/schema.js       — 테이블 DDL (ensureTable)
//   - lib/home-charger/poll-log.js     — 폴링 로그 누적/조회
//   - lib/home-charger/usage.js        — 충전기 사용 카운트 누적/조회
//   - lib/home-charger/fleet-stats.js  — 단지 전체 집계 (팝업 통계)

import pool from '@/lib/db';
import { formatHM } from '@/lib/kst';
import { ensureTable } from './home-charger/schema';
import { recordPollLog } from './home-charger/poll-log';
import { recordUsageDb, fetchUsageDb } from './home-charger/usage';

const BASE = 'https://apis.data.go.kr/B552584/EvCharger/getChargerInfo';

// 공공 API 일일 쿼터 1,000회/일 고려하여 시간대별 TTL 설정 (fallback)
// 범위: 5~12분
const CACHE_TIERS = [
  { start:  0, end:  1, ttlMs: 10 * 60_000 }, // 자정 직후
  { start:  1, end:  6, ttlMs: 10 * 60_000 }, // 새벽
  { start:  6, end: 13, ttlMs: 10 * 60_000 }, // 아침~점심 전
  { start: 13, end: 18, ttlMs: 12 * 60_000 }, // 오후
  { start: 18, end: 22, ttlMs:  5 * 60_000 }, // 저녁 피크
  { start: 22, end: 24, ttlMs:  7 * 60_000 }, // 저녁 마감~심야 전환
];
const FALLBACK_TTL_MS = 10 * 60_000;

// 동적 TTL: 실제 충전 히스토리(최근 90일)에서 학습
// false로 두면 항상 위의 CACHE_TIERS(static)만 사용 — 사용자가 지정한 스케줄 그대로 유지
const USE_DYNAMIC_TTL = false;
const TTL_MIN_MS =  4 * 60_000;  // 피크 시간대 최소 4분
const TTL_MAX_MS = 15 * 60_000;  // 한산한 시간대 최대 15분
const DYN_REFRESH_MS = 24 * 60 * 60_000; // 24시간마다 재계산
let dynamicTtls = null;  // [24] ms 배열, null이면 static fallback
let ttlComputedAt = 0;
let dynRefreshing = false;

let cache = { ts: 0, data: null };
let inflight = null;
let lastError = null;
let quotaCooldownUntil = 0; // 쿼터 초과 감지 시 이 시각까지 백그라운드 호출 억제
let failureCooldownUntil = 0; // 일반 실패(네트워크/파싱 등) 시 10분 쿨다운
// 진단: 서버 인스트루멘테이션/클라이언트 폴링 동작 여부 확인용
// NOTE: Next.js가 instrumentation-node와 API route를 별도 번들로 만들어
// 이 모듈의 복사본이 2개 이상 생길 수 있음 → 모듈 레벨 let은 상태 공유 실패.
// globalThis에 싱글톤으로 묶어 번들 경계를 우회.
const DIAG_KEY = '__homeChargerDiag__';
if (!globalThis[DIAG_KEY]) {
  globalThis[DIAG_KEY] = {
    warmCallCount: 0,   // 실제 upstream fetch 실행 횟수 (fresh면 no-op이라 증가 안 함)
    lastWarmAt: 0,
    tickCallCount: 0,   // setInterval 콜백 진입 횟수 (no-op 여부와 무관하게 루프 생존 신호)
    lastTickAt: 0,
    processStartedAt: Date.now(),
  };
}
const diag = globalThis[DIAG_KEY];

function staticTtlMs(now) {
  const kstHour = (now.getUTCHours() + 9) % 24;
  for (const t of CACHE_TIERS) {
    const inTier = t.start < t.end
      ? kstHour >= t.start && kstHour < t.end
      : kstHour >= t.start || kstHour < t.end;
    if (inTier) return t.ttlMs;
  }
  return FALLBACK_TTL_MS;
}

export function cacheTtlMs(now = new Date()) {
  if (USE_DYNAMIC_TTL) {
    if (Date.now() - ttlComputedAt > DYN_REFRESH_MS) {
      refreshDynamicTtls().catch(e => console.warn('[home-charger] dyn ttl refresh failed:', e.message));
    }
    if (dynamicTtls) {
      const kstHour = (now.getUTCHours() + 9) % 24;
      return dynamicTtls[kstHour];
    }
  }
  return staticTtlMs(now);
}

// 실제 충전 히스토그램 기반 TTL 산출 (하이브리드: 시작×2 + 커버리지×1)
async function refreshDynamicTtls() {
  if (dynRefreshing) return;
  dynRefreshing = true;
  try {
    const [startRes, coverRes] = await Promise.all([
      pool.query(`
        SELECT EXTRACT(HOUR FROM start_date + INTERVAL '9 hours')::int AS h, COUNT(*)::int AS n
        FROM charging_processes
        WHERE start_date > NOW() - INTERVAL '90 days'
        GROUP BY 1
      `),
      pool.query(`
        SELECT EXTRACT(HOUR FROM gs + INTERVAL '9 hours')::int AS h, COUNT(*)::int AS n
        FROM charging_processes,
          LATERAL generate_series(
            date_trunc('hour', start_date),
            date_trunc('hour', COALESCE(end_date, start_date)),
            INTERVAL '1 hour'
          ) AS gs
        WHERE start_date > NOW() - INTERVAL '90 days'
        GROUP BY 1
      `),
    ]);
    const startH = new Array(24).fill(0);
    const coverH = new Array(24).fill(0);
    for (const r of startRes.rows) startH[r.h] = r.n;
    for (const r of coverRes.rows) coverH[r.h] = r.n;
    // 하이브리드 점수: 시작 시각 가중 2배 + 세션 커버리지
    const scores = startH.map((s, i) => s * 2 + coverH[i]);
    const total = scores.reduce((a, b) => a + b, 0);
    if (total === 0) {
      // 데이터 없음 → static fallback 유지
      dynamicTtls = null;
      ttlComputedAt = Date.now();
      console.log('[home-charger] dyn ttl: no charging history, using static');
      return;
    }
    // 기존 static TTL을 앵커로, 사용 빈도에 따라 위아래로 조정
    // ratio = 해당 시간대 점수 / 평균 점수
    //   ratio > 1 (평균보다 바쁨) → static TTL을 줄임 (짧게)
    //   ratio < 1 (평균보다 한산) → static TTL을 늘림 (길게)
    //   ratio = 0 (활동 전무)   → 최대 4배로 늘림
    // 최종 [3, 30]분 범위로 clamp
    const avg = total / 24;
    const ttls = scores.map((n, h) => {
      const base = staticTtlMs(new Date(Date.UTC(2000, 0, 1, h - 9))); // KST h시의 static
      const ratio = avg > 0 ? n / avg : 0;
      // multiplier = 1 / clamp(ratio, 0.25, 4) → 범위 [0.25, 4]
      // ratio=0이면 ratio 대체값 0.25 써서 multiplier=4 (최대 늘림)
      const effRatio = Math.max(0.25, Math.min(4, ratio || 0.25));
      const multiplier = 1 / effRatio;
      const ms = base * multiplier;
      return Math.max(TTL_MIN_MS, Math.min(TTL_MAX_MS, Math.round(ms / 60_000) * 60_000));
    });
    dynamicTtls = ttls;
    ttlComputedAt = Date.now();
    const peakH = scores.indexOf(Math.max(...scores));
    const minTtlMin = Math.min(...ttls) / 60_000;
    const maxTtlMin = Math.max(...ttls) / 60_000;
    console.log(`[home-charger] dyn ttl: peak ${peakH}h, range ${minTtlMin}~${maxTtlMin}m`);
  } finally {
    dynRefreshing = false;
  }
}

export function getCache() { return cache; }
export function setCache(data) {
  cache = { ts: Date.now(), data };
  // DB 스냅샷 저장 (fire-and-forget)
  saveSnapshotToDb(data).catch(() => {});
}
export function isFresh() { return !!cache.data && Date.now() - cache.ts < cacheTtlMs(); }
export function getLastError() { return lastError; }

// UI 마우스 오버에 표시할 폴링 주기 정보
export function getTtlInfo() {
  const now = new Date();
  const kstHour = (now.getUTCHours() + 9) % 24;
  const currentMs = cacheTtlMs(now);
  // 24시간 스케줄 (분 단위)
  const useDyn = USE_DYNAMIC_TTL && !!dynamicTtls;
  const schedule = [];
  for (let h = 0; h < 24; h++) {
    const ms = useDyn
      ? dynamicTtls[h]
      : staticTtlMs(new Date(Date.UTC(2000, 0, 1, h - 9)));
    schedule.push(Math.round(ms / 60_000));
  }
  return {
    dynamic: useDyn,
    currentMin: Math.round(currentMs / 60_000),
    currentHour: kstHour,
    schedule, // [24] 분 배열
    updatedAt: ttlComputedAt,
  };
}

export function getStatIds() {
  const multi = process.env.HOME_CHARGER_STAT_IDS;
  if (multi) {
    const ids = multi.split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length) return ids;
  }
  const single = process.env.HOME_CHARGER_STAT_ID;
  return [single || 'PI795111'];
}

function parseItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) {
    const body = m[1];
    const get = (tag) => {
      const r = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(body);
      return r ? r[1].trim() : '';
    };
    items.push({
      statId: get('statId'),
      statNm: get('statNm'),
      chgerId: get('chgerId'),
      chgerType: get('chgerType'),
      addr: get('addr'),
      addrDetail: get('addrDetail'),
      lat: get('lat'),
      lng: get('lng'),
      useTime: get('useTime'),
      output: get('output'),
      busiNm: get('busiNm'),
      parkingFree: get('parkingFree'),
      stat: get('stat'),
      statUpdDt: get('statUpdDt'),
      lastTsdt: get('lastTsdt'),
      lastTedt: get('lastTedt'),
    });
  }
  return items;
}

class QuotaExceededError extends Error {
  constructor(detail) {
    super(`일일 쿼터 초과 — 자정(KST) 이후 자동 복구${detail ? ` (${detail})` : ''}`);
    this.quota = true;
  }
}

async function fetchStationOnce(statId, key) {
  const url = new URL(BASE);
  url.searchParams.set('serviceKey', key);
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', '100'); // 한 스테이션의 충전기 수는 최대 수십 대
  url.searchParams.set('statId', statId);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 429) throw new QuotaExceededError('HTTP 429');
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const text = await res.text();
  const errMsg = /<errMsg>([^<]+)<\/errMsg>/.exec(text)?.[1]?.trim();
  const authMsg = /<returnAuthMsg>([^<]+)<\/returnAuthMsg>/.exec(text)?.[1]?.trim();
  if (authMsg && /LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS/i.test(authMsg)) {
    throw new QuotaExceededError(authMsg);
  }
  if (errMsg && errMsg !== 'NORMAL SERVICE.') {
    throw new Error(`API ${errMsg}${authMsg ? ` / ${authMsg}` : ''}`);
  }
  return parseItems(text);
}

async function fetchStation(statId, key) {
  try {
    return await fetchStationOnce(statId, key);
  } catch (e) {
    if (e.quota) throw e; // 쿼터 초과면 재시도 무의미
    await new Promise(r => setTimeout(r, 200 + Math.random() * 400));
    return fetchStationOnce(statId, key);
  }
}

function toStationPayload(items) {
  if (!items.length) return null;
  const first = items[0];
  const station = {
    statId: first.statId,
    statNm: first.statNm,
    addr: [first.addr, first.addrDetail].filter(v => v && v !== 'null').join(' '),
    lat: Number(first.lat) || null,
    lng: Number(first.lng) || null,
    busiNm: first.busiNm,
    useTime: first.useTime,
    parkingFree: first.parkingFree === 'Y',
  };
  const chargers = items.map(it => ({
    chgerId: it.chgerId,
    chgerType: it.chgerType,
    output: Number(it.output) || null,
    stat: it.stat,
    statUpdDt: it.statUpdDt,
    lastTsdt: it.lastTsdt,
    lastTedt: it.lastTedt,
  })).sort((a, b) => a.chgerId.localeCompare(b.chgerId));
  return { station, chargers };
}

let lastQuotaHitAt = 0;
function applyQuotaCooldown() {
  // 429는 1시간 단위로 재확인
  lastQuotaHitAt = Date.now();
  quotaCooldownUntil = Date.now() + 60 * 60_000;
  lastError = `일일 쿼터 초과 — ${formatHM(quotaCooldownUntil)} 재시도 예정`;
}

// 실패 처리:
//  · 첫 실패 → 3분 후 1회 재시도 (retryPending=true 로 다음 warm 호출을 retry로 식별)
//  · 재시도도 실패 → 본격 쿨다운 8분
// TTL 자체가 각 대기 시간보다 짧으면 쿨다운 미적용 (자연 폴링 주기로 충분)
const RETRY_DELAY_MS = 3 * 60_000;
const FAILURE_COOLDOWN_MS = 8 * 60_000;
let retryPending = false;
function applyFailureCooldown(reason, { isRetry = false } = {}) {
  const ms = isRetry ? FAILURE_COOLDOWN_MS : RETRY_DELAY_MS;
  if (cacheTtlMs() < ms) {
    console.warn(`[home-charger] fail (TTL<${ms/60_000}m, no cooldown) — ${reason}`);
    retryPending = !isRetry; // 첫 실패는 다음 시도를 재시도로 표시 (쿨다운 없어도)
    return;
  }
  failureCooldownUntil = Date.now() + ms;
  retryPending = !isRetry;
  console.warn(`[home-charger] ${isRetry ? 'retry also failed — backoff 8m' : 'fail — retry in 3m'} · ${reason} · next at ${formatHM(failureCooldownUntil)}`);
}

export function isQuotaCooldown() { return Date.now() < quotaCooldownUntil; }
export function getQuotaCooldownUntil() { return quotaCooldownUntil; }
export function getLastQuotaHitAt() { return lastQuotaHitAt; }
export function isFailureCooldown() { return Date.now() < failureCooldownUntil; }
export function getFailureCooldownUntil() { return failureCooldownUntil; }
export function recordTick() {
  diag.tickCallCount++;
  diag.lastTickAt = Date.now();
}
export function getWarmDiag() {
  return {
    warmCallCount: diag.warmCallCount,
    lastWarmAt: diag.lastWarmAt,
    tickCallCount: diag.tickCallCount,
    lastTickAt: diag.lastTickAt,
    processStartedAt: diag.processStartedAt,
    uptimeMs: Date.now() - diag.processStartedAt,
  };
}

const SNAPSHOT_KEY = 'main';

async function saveSnapshotToDb(payload) {
  try {
    await ensureTable();
    await pool.query(
      `INSERT INTO home_charger_snapshot (cache_key, payload, fetched_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (cache_key) DO UPDATE
         SET payload = EXCLUDED.payload, fetched_at = EXCLUDED.fetched_at`,
      [SNAPSHOT_KEY, JSON.stringify(payload)]
    );
  } catch (e) {
    console.warn('[home-charger] snapshot save failed:', e.message);
  }
}

async function loadSnapshotFromDb() {
  try {
    await ensureTable();
    const res = await pool.query(
      `SELECT payload, fetched_at FROM home_charger_snapshot WHERE cache_key = $1`,
      [SNAPSHOT_KEY]
    );
    if (!res.rows.length) return null;
    return { data: res.rows[0].payload, ts: new Date(res.rows[0].fetched_at).getTime() };
  } catch (e) {
    console.warn('[home-charger] snapshot load failed:', e.message);
    return null;
  }
}

// 컨테이너 기동 직후 DB에 저장된 마지막 스냅샷을 메모리 캐시로 복원 (1회)
let bootstrapDone = false;
export async function bootstrapCacheFromDb() {
  if (bootstrapDone) return;
  bootstrapDone = true;
  if (cache.data) return; // 이미 메모리에 있으면 스킵
  const snap = await loadSnapshotFromDb();
  if (snap?.data) {
    cache = snap;
    console.log(`[home-charger] restored snapshot from DB (age ${Math.round((Date.now() - snap.ts) / 1000)}s)`);
  }
}

export async function loadStations(statIds, key) {
  const results = await Promise.all(statIds.map(async id => {
    try {
      const items = await fetchStation(id, key);
      return { id, result: toStationPayload(items) };
    } catch (e) {
      console.warn(`[home-charger] statId=${id} failed:`, e.message);
      return { id, result: null, error: e, errMsg: e.message };
    }
  }));
  const quotaHit = results.find(r => r.error?.quota);
  if (quotaHit) {
    applyQuotaCooldown();
  } else {
    const firstErr = results.find(r => r.errMsg)?.errMsg;
    if (firstErr) lastError = firstErr;
  }
  return results.map(r => r.result).filter(Boolean);
}

export async function warmIfNeeded() {
  // 진단: 진입할 때마다 카운트 (fresh/cooldown으로 skip 되어도 1회 집계)
  diag.warmCallCount++;
  diag.lastWarmAt = Date.now();
  // fire-and-forget — 로그 실패해도 원래 로직 영향 없음
  recordPollLog({ warmCalls: 1 }).catch(() => {});
  const key = process.env.EV_CHARGER_API_KEY;
  if (!key) return null;
  // 최초 호출 시 DB 스냅샷 복원 (컨테이너 재시작 직후 마지막 상태 즉시 노출)
  await bootstrapCacheFromDb();
  const statIds = getStatIds();
  if (isFresh()) return cache.data;
  if (isQuotaCooldown()) return cache.data; // 쿼터 초과 중엔 호출 억제, 기존 캐시만 사용
  if (isFailureCooldown()) return cache.data; // 일반 실패 후 10분간 재호출 억제
  if (inflight) return inflight;
  const isRetryAttempt = retryPending;
  inflight = (async () => {
    try {
      const stations = await loadStations(statIds, key);
      if (stations.length) {
        await recordUsageDb(stations);
        const usage = await fetchUsageDb(stations.map(s => s.station.statId));
        const payload = { stations, fetchedAt: new Date().toISOString(), usage };
        setCache(payload);
        const full = stations.length === statIds.length;
        if (full) {
          lastError = null;
          failureCooldownUntil = 0;
          retryPending = false;
        }
        if (isRetryAttempt) {
          recordPollLog({ attempts: 1, retrySuccesses: 1, partial: full ? 0 : 1 });
        } else if (full) {
          recordPollLog({ attempts: 1, successes: 1 });
        } else {
          recordPollLog({ attempts: 1, partial: 1 });
        }
        console.log(`[home-charger] warm cache loaded (${stations.length}/${statIds.length} station(s), ${stations.reduce((s,x)=>s+x.chargers.length,0)} chargers)${isRetryAttempt ? ' · retry succeeded' : ''}`);
        return payload;
      }

      if (!lastError) lastError = `스테이션 매칭 없음 (요청 ${statIds.join(',')})`;
      if (isQuotaCooldown()) {
        recordPollLog({ attempts: 1, quotaHits: 1 });
      } else {
        applyFailureCooldown(lastError, { isRetry: isRetryAttempt });
        recordPollLog({ attempts: 1, retries: 1 });
      }
      return null;
    } catch (e) {
      lastError = e.message || String(e);
      console.warn('[home-charger] warm failed:', lastError);
      applyFailureCooldown(lastError, { isRetry: isRetryAttempt });
      recordPollLog({ attempts: 1, retries: 1 });
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// 호환 re-export — 메인 route는 cache 모듈에서 한꺼번에 import
export { recordPollLog, recordUsageDb, fetchUsageDb };
