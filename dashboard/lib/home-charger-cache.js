// 집충전기(환경공단 EvCharger) 캐시 모듈.
// 각 statId별로 getChargerInfo?statId=XXX 호출 (전국 풀스캔 불필요, 쿼터 대폭 절감).

import pool from '@/lib/db';
import { formatHM, kstDateStr, KST_OFFSET_MS } from '@/lib/kst';

const BASE = 'https://apis.data.go.kr/B552584/EvCharger/getChargerInfo';

// 공공 API 일일 쿼터 1,000회/일 고려하여 시간대별 TTL 설정 (fallback)
// 범위: 4~15분
const CACHE_TIERS = [
  { start:  0, end:  1, ttlMs: 10 * 60_000 }, // 자정 직후
  { start:  1, end:  6, ttlMs: 12 * 60_000 }, // 새벽
  { start:  6, end: 13, ttlMs: 12 * 60_000 }, // 아침~점심 전
  { start: 13, end: 18, ttlMs: 15 * 60_000 }, // 오후
  { start: 18, end: 22, ttlMs:  4 * 60_000 }, // 저녁 피크
  { start: 22, end: 24, ttlMs:  6 * 60_000 }, // 저녁 마감~심야 전환
];
const FALLBACK_TTL_MS = 12 * 60_000;

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

// 폴링 로그 기록 — 시간 단위 버킷에 시도/성공/재시도/쿼터 카운트 누적
// manualAttempts:  /api/home-charger?refresh=1 경로 (수동 갱신 버튼)
// retrySuccesses:  첫 시도 실패 후 즉시 1회 재시도에서 성공
// retries:         재시도도 실패
export async function recordPollLog({
  attempts = 0, successes = 0, partial = 0,
  retries = 0, retrySuccesses = 0,
  quotaHits = 0, manualAttempts = 0, warmCalls = 0,
} = {}) {
  try {
    await ensureTable();
    const now = Date.now();
    const kstHour = new Date(now + KST_OFFSET_MS).getUTCHours();
    const kstDate = kstDateStr(now);
    await pool.query(
      `INSERT INTO home_charger_poll_log (date, hour, attempts, successes, partial, retries, retry_successes, quota_hits, manual_attempts, warm_calls)
       VALUES ($1::date, $2::smallint, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (date, hour) DO UPDATE
         SET attempts        = home_charger_poll_log.attempts        + EXCLUDED.attempts,
             successes       = home_charger_poll_log.successes       + EXCLUDED.successes,
             partial         = home_charger_poll_log.partial         + EXCLUDED.partial,
             retries         = home_charger_poll_log.retries         + EXCLUDED.retries,
             retry_successes = home_charger_poll_log.retry_successes + EXCLUDED.retry_successes,
             quota_hits      = home_charger_poll_log.quota_hits      + EXCLUDED.quota_hits,
             manual_attempts = home_charger_poll_log.manual_attempts + EXCLUDED.manual_attempts,
             warm_calls      = home_charger_poll_log.warm_calls      + EXCLUDED.warm_calls,
             updated_at      = NOW()`,
      [kstDate, kstHour, attempts, successes, partial, retries, retrySuccesses, quotaHits, manualAttempts, warmCalls]
    );
  } catch (e) {
    console.warn('[home-charger] poll log failed:', e.message);
  }
}

// 특정 날짜(기본 오늘)의 24시간 폴링 로그 조회
export async function fetchPollLogDb(date) {
  try {
    await ensureTable();
    const target = date || kstDateStr(Date.now());
    const res = await pool.query(
      `SELECT hour, attempts, successes, partial, retries, retry_successes, quota_hits, manual_attempts, warm_calls
         FROM home_charger_poll_log
        WHERE date = $1::date
        ORDER BY hour`,
      [target]
    );
    const rowsByHour = {};
    for (const r of res.rows) {
      rowsByHour[Number(r.hour)] = {
        hour: Number(r.hour),
        attempts: Number(r.attempts),
        successes: Number(r.successes),
        partial: Number(r.partial),
        retries: Number(r.retries),
        retrySuccesses: Number(r.retry_successes),
        quotaHits: Number(r.quota_hits),
        manualAttempts: Number(r.manual_attempts),
        warmCalls: Number(r.warm_calls),
      };
    }
    const empty = { attempts: 0, successes: 0, partial: 0, retries: 0, retrySuccesses: 0, quotaHits: 0, manualAttempts: 0, warmCalls: 0 };
    const hourly = [];
    for (let h = 0; h < 24; h++) {
      hourly.push(rowsByHour[h] || { hour: h, ...empty });
    }
    const totals = hourly.reduce((a, r) => ({
      attempts: a.attempts + r.attempts,
      successes: a.successes + r.successes,
      partial: a.partial + r.partial,
      retries: a.retries + r.retries,
      retrySuccesses: a.retrySuccesses + (r.retrySuccesses || 0),
      quotaHits: a.quotaHits + r.quotaHits,
      manualAttempts: a.manualAttempts + r.manualAttempts,
      warmCalls: a.warmCalls + (r.warmCalls || 0),
    }), { ...empty });
    return { date: target, hourly, totals };
  } catch (e) {
    console.warn('[home-charger] poll log fetch failed:', e.message);
    return { date: null, hourly: [], totals: {} };
  }
}

// 일별 집계 — 최근 N일 (기본 14일)
export async function fetchPollLogDailyDb(days = 14) {
  try {
    await ensureTable();
    const clampDays = Math.max(1, Math.min(90, Math.floor(Number(days) || 14)));
    const res = await pool.query(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date_str,
              SUM(attempts)::int         AS attempts,
              SUM(successes)::int        AS successes,
              SUM(partial)::int          AS partial,
              SUM(retries)::int          AS retries,
              SUM(retry_successes)::int  AS retry_successes,
              SUM(quota_hits)::int       AS quota_hits,
              SUM(manual_attempts)::int  AS manual_attempts,
              SUM(warm_calls)::int       AS warm_calls
         FROM home_charger_poll_log
        WHERE date >= (((NOW() AT TIME ZONE 'Asia/Seoul')::date) - ($1::int * INTERVAL '1 day'))::date
        GROUP BY date
        ORDER BY date DESC`,
      [clampDays]
    );
    const daily = res.rows.map(r => ({
      date: r.date_str,
      attempts: Number(r.attempts),
      successes: Number(r.successes),
      partial: Number(r.partial),
      retries: Number(r.retries),
      retrySuccesses: Number(r.retry_successes),
      quotaHits: Number(r.quota_hits),
      manualAttempts: Number(r.manual_attempts),
      warmCalls: Number(r.warm_calls),
    }));
    const totals = daily.reduce((a, r) => ({
      attempts: a.attempts + r.attempts,
      successes: a.successes + r.successes,
      partial: a.partial + r.partial,
      retries: a.retries + r.retries,
      retrySuccesses: a.retrySuccesses + r.retrySuccesses,
      quotaHits: a.quotaHits + r.quotaHits,
      manualAttempts: a.manualAttempts + r.manualAttempts,
      warmCalls: a.warmCalls + r.warmCalls,
    }), { attempts: 0, successes: 0, partial: 0, retries: 0, retrySuccesses: 0, quotaHits: 0, manualAttempts: 0, warmCalls: 0 });
    return { days: clampDays, daily, totals };
  } catch (e) {
    console.warn('[home-charger] poll log daily fetch failed:', e.message);
    return { days: 0, daily: [], totals: {} };
  }
}

let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  // 컨테이너 재시작(배포)마다 카운트 보존 — DROP 금지, IF NOT EXISTS로만 생성
  await pool.query(`
    CREATE TABLE IF NOT EXISTS charger_usage (
      stat_id    VARCHAR(20) NOT NULL,
      chger_id   VARCHAR(20) NOT NULL,
      hour       SMALLINT    NOT NULL,
      count      INTEGER     NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (stat_id, chger_id, hour)
    )
  `);
  // 과거 구버전 스키마에서 업그레이드 — 컬럼 누락 시 ALTER로 보강 (DROP 금지)
  await pool.query(`ALTER TABLE charger_usage ADD COLUMN IF NOT EXISTS stat_id VARCHAR(20) NOT NULL DEFAULT 'PI795111'`);
  await pool.query(`ALTER TABLE charger_usage ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  // 날짜 기반 일별 집계 — 기간 필터(1~12개월) 상세 팝업용
  await pool.query(`
    CREATE TABLE IF NOT EXISTS charger_usage_daily (
      stat_id    VARCHAR(20) NOT NULL,
      chger_id   VARCHAR(20) NOT NULL,
      date       DATE        NOT NULL,
      hour       SMALLINT    NOT NULL,
      count      INTEGER     NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (stat_id, chger_id, date, hour)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS charger_usage_daily_date_idx ON charger_usage_daily (date)`);
  // 폴링 시도/성공/재시도 로그 — 디버그 팝업용
  // retries         = 재시도 후에도 실패한 건수
  // retry_successes = 재시도 후 성공한 건수 (첫 시도 실패 → 즉시 1회 retry)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS home_charger_poll_log (
      date             DATE     NOT NULL,
      hour             SMALLINT NOT NULL,
      attempts         INTEGER  NOT NULL DEFAULT 0,
      successes        INTEGER  NOT NULL DEFAULT 0,
      partial          INTEGER  NOT NULL DEFAULT 0,
      retries          INTEGER  NOT NULL DEFAULT 0,
      retry_successes  INTEGER  NOT NULL DEFAULT 0,
      quota_hits       INTEGER  NOT NULL DEFAULT 0,
      manual_attempts  INTEGER  NOT NULL DEFAULT 0,
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (date, hour)
    )
  `);
  await pool.query(`ALTER TABLE home_charger_poll_log ADD COLUMN IF NOT EXISTS manual_attempts INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE home_charger_poll_log ADD COLUMN IF NOT EXISTS retry_successes INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE home_charger_poll_log ADD COLUMN IF NOT EXISTS warm_calls INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`CREATE INDEX IF NOT EXISTS home_charger_poll_log_date_idx ON home_charger_poll_log (date)`);
  // 환경공단 API 응답 스냅샷 — 컨테이너 재시작 간 캐시 영속화
  await pool.query(`
    CREATE TABLE IF NOT EXISTS home_charger_snapshot (
      cache_key  VARCHAR(20) PRIMARY KEY,
      payload    JSONB       NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL
    )
  `);
  tableReady = true;
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

// 30분당 최대 1회 증가 — 같은 (stat_id, chger_id, hour) 버킷은 30분 간격으로 +1
// 직전 업데이트로부터 30분 미경과면 스킵 (시간당 최대 2, 하루 최대 48)
// daily 테이블에도 같은 30분 룰로 (date, hour) 단위 기록
export async function recordUsageDb(stations) {
  try {
    await ensureTable();
    const now = Date.now();
    const kstHour = new Date(now + KST_OFFSET_MS).getUTCHours();
    const kstDate = kstDateStr(now);
    const rows = stations.flatMap(s =>
      s.chargers.filter(c => c.stat === '3').map(c => [s.station.statId, c.chgerId])
    );
    if (!rows.length) return;
    const statIds  = rows.map(r => r[0]);
    const chgerIds = rows.map(r => r[1]);
    await pool.query(
      `INSERT INTO charger_usage (stat_id, chger_id, hour, count)
       SELECT unnest($1::text[]), unnest($2::text[]), $3::smallint, 1
       ON CONFLICT (stat_id, chger_id, hour) DO UPDATE
         SET count = charger_usage.count + 1,
             updated_at = NOW()
         WHERE charger_usage.updated_at < NOW() - INTERVAL '30 minutes'`,
      [statIds, chgerIds, kstHour]
    );
    await pool.query(
      `INSERT INTO charger_usage_daily (stat_id, chger_id, date, hour, count)
       SELECT unnest($1::text[]), unnest($2::text[]), $3::date, $4::smallint, 1
       ON CONFLICT (stat_id, chger_id, date, hour) DO UPDATE
         SET count = charger_usage_daily.count + 1,
             updated_at = NOW()
         WHERE charger_usage_daily.updated_at < NOW() - INTERVAL '30 minutes'`,
      [statIds, chgerIds, kstDate, kstHour]
    );
  } catch (e) {
    console.warn('[home-charger] usage record failed:', e.message);
  }
}

// 단지 전체 집계
// - 시간대/요일 히스토그램 · 집계 일수 · 기간 총합: charger_usage_daily (기간 필터)
// - 충전기 순위(perCharger): charger_usage (전체 기간 누적 — 메인 카드와 동일 기준)
// 반환: { hourly[24], dow[7], perCharger[], total(기간), daysCovered, allTimeTotal, months }
export async function fetchFleetStatsDb(statIds, months) {
  const clampMonths = Math.max(1, Math.min(12, Math.floor(Number(months) || 3)));
  const empty = {
    hourly: Array(24).fill(0),
    hourlyAllTime: Array(24).fill(0),
    dow: Array(7).fill(0),
    dowAllTime: Array(7).fill(0),
    perCharger: [],
    total: 0,
    daysCovered: 0,
    allTimeTotal: 0,
    months: clampMonths,
  };
  try {
    await ensureTable();
    if (!statIds.length) return empty;

    // 1) 기간 스코프 (일별 테이블) — 시간대/요일
    const dailyRes = await pool.query(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date_str, hour, count
         FROM charger_usage_daily
        WHERE stat_id = ANY($1)
          AND date >= (((NOW() AT TIME ZONE 'Asia/Seoul')::date) - ($2::int * INTERVAL '1 month'))::date
      `,
      [statIds, clampMonths]
    );
    const hourly = new Array(24).fill(0);
    const dow = new Array(7).fill(0);
    const dateSet = new Set();
    let periodTotal = 0;
    for (const row of dailyRes.rows) {
      // 시간당 최대 1포인트 정규화 — raw count(0~2)를 0/1로 clip
      const c = Math.min(1, Number(row.count));
      periodTotal += c;
      hourly[row.hour] += c;
      const [y, m, d] = row.date_str.split('-').map(Number);
      const dowIdx = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      dow[dowIdx] += c;
      dateSet.add(row.date_str);
    }

    // 2) Top/Bottom 순위 — charger_usage_daily에서 1시간당 최대 1포인트로 정규화
    //    (기존 charger_usage는 30분 룰로 시간당 최대 2 포인트라 실제 "사용 시간 수"와 괴리)
    const rankRes = await pool.query(
      `SELECT stat_id, chger_id, SUM(LEAST(count, 1))::bigint AS total
         FROM charger_usage_daily
        WHERE stat_id = ANY($1)
        GROUP BY stat_id, chger_id
        ORDER BY total DESC`,
      [statIds]
    );
    const perCharger = rankRes.rows.map(r => ({
      key: `${r.stat_id}_${r.chger_id}`,
      count: Number(r.total),
    }));
    // 캐시된 스테이션 목록에서 미사용(카운트 0) 충전기도 순위에 포함
    const cachedStations = cache.data?.stations || [];
    const existingKeys = new Set(perCharger.map(e => e.key));
    for (const s of cachedStations) {
      if (!statIds.includes(s.station.statId)) continue;
      for (const c of s.chargers) {
        const key = `${s.station.statId}_${c.chgerId}`;
        if (!existingKeys.has(key)) {
          perCharger.push({ key, count: 0 });
          existingKeys.add(key);
        }
      }
    }
    perCharger.sort((a, b) => b.count - a.count);
    const allTimeTotal = perCharger.reduce((s, e) => s + e.count, 0);

    // 2-b) 전일까지 누적 랭킹 — 오늘(KST) 제외해서 어제 끝 시점 순위 산출
    const prevRankRes = await pool.query(
      `SELECT stat_id, chger_id, SUM(LEAST(count, 1))::bigint AS total
         FROM charger_usage_daily
        WHERE stat_id = ANY($1)
          AND date < ((NOW() AT TIME ZONE 'Asia/Seoul')::date)
        GROUP BY stat_id, chger_id`,
      [statIds]
    );
    const prevCountMap = new Map();
    for (const r of prevRankRes.rows) {
      prevCountMap.set(`${r.stat_id}_${r.chger_id}`, Number(r.total));
    }
    const prevEntries = perCharger.map(e => ({ key: e.key, count: prevCountMap.get(e.key) || 0 }));
    prevEntries.sort((a, b) => b.count - a.count);
    // 경쟁 순위 (1, 2, 2, 4): 동점은 같은 등수
    const prevRankMap = new Map();
    {
      let rank = 0;
      let lastCount = null;
      for (let i = 0; i < prevEntries.length; i++) {
        const e = prevEntries[i];
        if (e.count !== lastCount) {
          rank = i + 1;
          lastCount = e.count;
        }
        prevRankMap.set(e.key, { rank, count: e.count });
      }
    }
    {
      let rank = 0;
      let lastCount = null;
      for (let i = 0; i < perCharger.length; i++) {
        const e = perCharger[i];
        if (e.count !== lastCount) {
          rank = i + 1;
          lastCount = e.count;
        }
        e.rank = rank;
        const prev = prevRankMap.get(e.key);
        if (!prev || prev.count === 0) {
          e.isNew = e.count > 0;
          e.delta = null;
          e.prevRank = null;
        } else {
          e.prevRank = prev.rank;
          e.delta = prev.rank - rank; // +는 상승, -는 하락
          e.isNew = false;
        }
      }
    }

    // 3) 전체 누적 시간대 히스토그램 — 1시간당 최대 1포인트 정규화 (동일 규칙)
    const hourlyAllRes = await pool.query(
      `SELECT hour, SUM(LEAST(count, 1))::bigint AS total
         FROM charger_usage_daily
        WHERE stat_id = ANY($1)
        GROUP BY hour`,
      [statIds]
    );
    const hourlyAllTime = new Array(24).fill(0);
    for (const r of hourlyAllRes.rows) {
      hourlyAllTime[Number(r.hour)] = Number(r.total);
    }

    // 4) 전체 누적 요일 히스토그램 — 일자별로 우선 집계 후 DoW 변환 (KST 기준 date)
    const dowAllRes = await pool.query(
      `SELECT EXTRACT(DOW FROM date)::int AS dow, SUM(LEAST(count, 1))::bigint AS total
         FROM charger_usage_daily
        WHERE stat_id = ANY($1)
        GROUP BY dow`,
      [statIds]
    );
    const dowAllTime = new Array(7).fill(0);
    for (const r of dowAllRes.rows) {
      dowAllTime[Number(r.dow)] = Number(r.total);
    }

    return {
      hourly,
      hourlyAllTime,
      dow,
      dowAllTime,
      perCharger,
      total: periodTotal,
      daysCovered: dateSet.size,
      allTimeTotal,
      months: clampMonths,
    };
  } catch (e) {
    console.warn('[home-charger] fleet stats failed:', e.message);
    return empty;
  }
}

// statIds 배열로 조회, 반환 키는 "statId_chgerId"
// charger_usage_daily를 시간당 최대 1포인트로 정규화 — 팝업 랭킹과 동일 기준
export async function fetchUsageDb(statIds) {
  try {
    await ensureTable();
    if (!statIds.length) return {};
    const res = await pool.query(
      `SELECT stat_id, chger_id, hour, SUM(LEAST(count, 1))::int AS count
         FROM charger_usage_daily
        WHERE stat_id = ANY($1)
        GROUP BY stat_id, chger_id, hour`,
      [statIds]
    );
    const usage = {};
    for (const row of res.rows) {
      const key = `${row.stat_id}_${row.chger_id}`;
      if (!usage[key]) usage[key] = { h: new Array(24).fill(0), t: 0 };
      usage[key].h[row.hour] = Number(row.count);
      usage[key].t += Number(row.count);
    }
    return usage;
  } catch (e) {
    console.warn('[home-charger] usage fetch failed:', e.message);
    return {};
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
