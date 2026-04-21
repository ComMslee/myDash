// 집충전기(환경공단 EvCharger) 캐시 모듈.
// 각 statId별로 getChargerInfo?statId=XXX 호출 (전국 풀스캔 불필요, 쿼터 대폭 절감).

import pool from '@/lib/db';

const BASE = 'https://apis.data.go.kr/B552584/EvCharger/getChargerInfo';

// 공공 API 일일 쿼터 1,000회/일 고려하여 시간대별 TTL 설정 (fallback)
// 범위: 4~20분
const CACHE_TIERS = [
  { start:  0, end:  2, ttlMs: 15 * 60_000 }, // 자정 직후
  { start:  2, end:  5, ttlMs: 20 * 60_000 }, // 깊은 새벽
  { start:  5, end: 13, ttlMs: 15 * 60_000 }, // 아침~점심 전
  { start: 13, end: 18, ttlMs: 10 * 60_000 }, // 오후
  { start: 18, end: 23, ttlMs:  4 * 60_000 }, // 저녁 귀가/충전 피크
  { start: 23, end: 24, ttlMs: 15 * 60_000 }, // 심야 전환
];
const FALLBACK_TTL_MS = 15 * 60_000;

// 동적 TTL: 실제 충전 히스토리(최근 90일)에서 학습
const TTL_MIN_MS =  4 * 60_000;  // 피크 시간대 최소 4분
const TTL_MAX_MS = 20 * 60_000;  // 한산한 시간대 최대 20분
const DYN_REFRESH_MS = 24 * 60 * 60_000; // 24시간마다 재계산
let dynamicTtls = null;  // [24] ms 배열, null이면 static fallback
let ttlComputedAt = 0;
let dynRefreshing = false;

let cache = { ts: 0, data: null };
let inflight = null;
let lastError = null;
let quotaCooldownUntil = 0; // 쿼터 초과 감지 시 이 시각까지 백그라운드 호출 억제
let failureCooldownUntil = 0; // 일반 실패(네트워크/파싱 등) 시 10분 쿨다운

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
  // 24시간 지났으면 백그라운드로 동적 TTL 갱신 트리거 (await 안 함)
  if (Date.now() - ttlComputedAt > DYN_REFRESH_MS) {
    refreshDynamicTtls().catch(e => console.warn('[home-charger] dyn ttl refresh failed:', e.message));
  }
  if (dynamicTtls) {
    const kstHour = (now.getUTCHours() + 9) % 24;
    return dynamicTtls[kstHour];
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
  const schedule = [];
  for (let h = 0; h < 24; h++) {
    const ms = dynamicTtls
      ? dynamicTtls[h]
      : staticTtlMs(new Date(Date.UTC(2000, 0, 1, h - 9)));
    schedule.push(Math.round(ms / 60_000));
  }
  return {
    dynamic: !!dynamicTtls,
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

function formatKstTime(ms) {
  const d = new Date(ms + 9 * 60 * 60 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function applyQuotaCooldown() {
  // 429는 1시간 단위로 재확인
  quotaCooldownUntil = Date.now() + 60 * 60_000;
  lastError = `일일 쿼터 초과 — ${formatKstTime(quotaCooldownUntil)} 재시도 예정`;
}

// 일반 실패(네트워크/파싱 등) 시 10분 대기 후 재시도
// 단, 현재 TTL이 10분 미만이면 쿨다운 미적용 — 자연 폴링 주기로 충분히 자주 재시도됨
const FAILURE_COOLDOWN_MS = 10 * 60_000;
function applyFailureCooldown(reason) {
  if (cacheTtlMs() < FAILURE_COOLDOWN_MS) {
    console.warn(`[home-charger] fail (TTL<10m, no cooldown) — ${reason}`);
    return;
  }
  failureCooldownUntil = Date.now() + FAILURE_COOLDOWN_MS;
  console.warn(`[home-charger] failure cooldown — ${reason} · retry at ${formatKstTime(failureCooldownUntil)}`);
}

export function isQuotaCooldown() { return Date.now() < quotaCooldownUntil; }
export function getQuotaCooldownUntil() { return quotaCooldownUntil; }
export function isFailureCooldown() { return Date.now() < failureCooldownUntil; }
export function getFailureCooldownUntil() { return failureCooldownUntil; }

// 폴링 로그 기록 — 시간 단위 버킷에 시도/성공/재시도/쿼터 카운트 누적
async function recordPollLog({ attempts = 0, successes = 0, partial = 0, retries = 0, quotaHits = 0 } = {}) {
  try {
    await ensureTable();
    const nowKstMs = Date.now() + 9 * 60 * 60_000;
    const nowKst = new Date(nowKstMs);
    const kstHour = nowKst.getUTCHours();
    const kstDate = `${nowKst.getUTCFullYear()}-${String(nowKst.getUTCMonth() + 1).padStart(2, '0')}-${String(nowKst.getUTCDate()).padStart(2, '0')}`;
    await pool.query(
      `INSERT INTO home_charger_poll_log (date, hour, attempts, successes, partial, retries, quota_hits)
       VALUES ($1::date, $2::smallint, $3, $4, $5, $6, $7)
       ON CONFLICT (date, hour) DO UPDATE
         SET attempts   = home_charger_poll_log.attempts   + EXCLUDED.attempts,
             successes  = home_charger_poll_log.successes  + EXCLUDED.successes,
             partial    = home_charger_poll_log.partial    + EXCLUDED.partial,
             retries    = home_charger_poll_log.retries    + EXCLUDED.retries,
             quota_hits = home_charger_poll_log.quota_hits + EXCLUDED.quota_hits,
             updated_at = NOW()`,
      [kstDate, kstHour, attempts, successes, partial, retries, quotaHits]
    );
  } catch (e) {
    console.warn('[home-charger] poll log failed:', e.message);
  }
}

// 특정 날짜(기본 오늘)의 24시간 폴링 로그 조회
export async function fetchPollLogDb(date) {
  try {
    await ensureTable();
    let target = date;
    if (!target) {
      const nowKstMs = Date.now() + 9 * 60 * 60_000;
      const nowKst = new Date(nowKstMs);
      target = `${nowKst.getUTCFullYear()}-${String(nowKst.getUTCMonth() + 1).padStart(2, '0')}-${String(nowKst.getUTCDate()).padStart(2, '0')}`;
    }
    const res = await pool.query(
      `SELECT hour, attempts, successes, partial, retries, quota_hits
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
        quotaHits: Number(r.quota_hits),
      };
    }
    const hourly = [];
    for (let h = 0; h < 24; h++) {
      hourly.push(rowsByHour[h] || { hour: h, attempts: 0, successes: 0, partial: 0, retries: 0, quotaHits: 0 });
    }
    const totals = hourly.reduce((a, r) => ({
      attempts: a.attempts + r.attempts,
      successes: a.successes + r.successes,
      partial: a.partial + r.partial,
      retries: a.retries + r.retries,
      quotaHits: a.quotaHits + r.quotaHits,
    }), { attempts: 0, successes: 0, partial: 0, retries: 0, quotaHits: 0 });
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
              SUM(attempts)::int   AS attempts,
              SUM(successes)::int  AS successes,
              SUM(partial)::int    AS partial,
              SUM(retries)::int    AS retries,
              SUM(quota_hits)::int AS quota_hits
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
      quotaHits: Number(r.quota_hits),
    }));
    const totals = daily.reduce((a, r) => ({
      attempts: a.attempts + r.attempts,
      successes: a.successes + r.successes,
      partial: a.partial + r.partial,
      retries: a.retries + r.retries,
      quotaHits: a.quotaHits + r.quotaHits,
    }), { attempts: 0, successes: 0, partial: 0, retries: 0, quotaHits: 0 });
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS home_charger_poll_log (
      date        DATE     NOT NULL,
      hour        SMALLINT NOT NULL,
      attempts    INTEGER  NOT NULL DEFAULT 0,
      successes   INTEGER  NOT NULL DEFAULT 0,
      partial     INTEGER  NOT NULL DEFAULT 0,
      retries     INTEGER  NOT NULL DEFAULT 0,
      quota_hits  INTEGER  NOT NULL DEFAULT 0,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (date, hour)
    )
  `);
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
    const nowKstMs = Date.now() + 9 * 60 * 60_000;
    const nowKst = new Date(nowKstMs);
    const kstHour = nowKst.getUTCHours();
    const kstDate = `${nowKst.getUTCFullYear()}-${String(nowKst.getUTCMonth() + 1).padStart(2, '0')}-${String(nowKst.getUTCDate()).padStart(2, '0')}`;
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
      const c = Number(row.count);
      periodTotal += c;
      hourly[row.hour] += c;
      const [y, m, d] = row.date_str.split('-').map(Number);
      const dowIdx = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      dow[dowIdx] += c;
      dateSet.add(row.date_str);
    }

    // 2) 전체 누적 (기존 시간 버킷 테이블) — Top/Bottom 순위
    const rankRes = await pool.query(
      `SELECT stat_id, chger_id, SUM(count)::bigint AS total
         FROM charger_usage
        WHERE stat_id = ANY($1)
        GROUP BY stat_id, chger_id
        ORDER BY total DESC`,
      [statIds]
    );
    const perCharger = rankRes.rows.map(r => ({
      key: `${r.stat_id}_${r.chger_id}`,
      count: Number(r.total),
    }));
    const allTimeTotal = perCharger.reduce((s, e) => s + e.count, 0);

    // 3) 전체 누적 시간대 히스토그램 — daily 데이터 부족 시 폴백 표시용
    const hourlyAllRes = await pool.query(
      `SELECT hour, SUM(count)::bigint AS total
         FROM charger_usage
        WHERE stat_id = ANY($1)
        GROUP BY hour`,
      [statIds]
    );
    const hourlyAllTime = new Array(24).fill(0);
    for (const r of hourlyAllRes.rows) {
      hourlyAllTime[Number(r.hour)] = Number(r.total);
    }

    return {
      hourly,
      hourlyAllTime,
      dow,
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
export async function fetchUsageDb(statIds) {
  try {
    await ensureTable();
    if (!statIds.length) return {};
    const res = await pool.query(
      `SELECT stat_id, chger_id, hour, count FROM charger_usage WHERE stat_id = ANY($1)`,
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
  const key = process.env.EV_CHARGER_API_KEY;
  if (!key) return null;
  // 최초 호출 시 DB 스냅샷 복원 (컨테이너 재시작 직후 마지막 상태 즉시 노출)
  await bootstrapCacheFromDb();
  const statIds = getStatIds();
  if (isFresh()) return cache.data;
  if (isQuotaCooldown()) return cache.data; // 쿼터 초과 중엔 호출 억제, 기존 캐시만 사용
  if (isFailureCooldown()) return cache.data; // 일반 실패 후 10분간 재호출 억제
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const stations = await loadStations(statIds, key);
      if (stations.length) {
        await recordUsageDb(stations);
        const usage = await fetchUsageDb(stations.map(s => s.station.statId));
        const payload = { stations, fetchedAt: new Date().toISOString(), usage };
        setCache(payload);
        if (stations.length === statIds.length) {
          lastError = null;
          failureCooldownUntil = 0; // 전부 성공 시 실패 쿨다운 해제
          recordPollLog({ attempts: 1, successes: 1 });
        } else {
          recordPollLog({ attempts: 1, partial: 1 });
        }
        console.log(`[home-charger] warm cache loaded (${stations.length}/${statIds.length} station(s), ${stations.reduce((s,x)=>s+x.chargers.length,0)} chargers)`);
        return payload;
      }
      if (!lastError) lastError = `스테이션 매칭 없음 (요청 ${statIds.join(',')})`;
      if (isQuotaCooldown()) {
        recordPollLog({ attempts: 1, quotaHits: 1 });
      } else {
        applyFailureCooldown(lastError);
        recordPollLog({ attempts: 1, retries: 1 });
      }
      return null;
    } catch (e) {
      lastError = e.message || String(e);
      console.warn('[home-charger] warm failed:', lastError);
      applyFailureCooldown(lastError);
      recordPollLog({ attempts: 1, retries: 1 });
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
