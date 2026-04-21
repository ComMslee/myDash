// 집충전기(환경공단 EvCharger) 캐시 모듈.
// 각 statId별로 getChargerInfo?statId=XXX 호출 (전국 풀스캔 불필요, 쿼터 대폭 절감).

import pool from '@/lib/db';

const BASE = 'https://apis.data.go.kr/B552584/EvCharger/getChargerInfo';

// 공공 API 일일 쿼터 1,000회/일 고려하여 시간대별 TTL 설정
const CACHE_TIERS = [
  { start:  0, end:  6, ttlMs: 40 * 60_000 }, // 심야
  { start:  6, end: 12, ttlMs: 15 * 60_000 }, // 오전
  { start: 12, end: 15, ttlMs:  4 * 60_000 }, // 점심 피크
  { start: 15, end: 17, ttlMs: 15 * 60_000 }, // 오후
  { start: 17, end: 22, ttlMs:  4 * 60_000 }, // 귀가/충전 피크
  { start: 22, end: 24, ttlMs: 15 * 60_000 }, // 저녁~자정
];
const FALLBACK_TTL_MS = 15 * 60_000;

let cache = { ts: 0, data: null };
let inflight = null;
let lastError = null;
let quotaCooldownUntil = 0; // 쿼터 초과 감지 시 이 시각까지 백그라운드 호출 억제

export function cacheTtlMs(now = new Date()) {
  const kstHour = (now.getUTCHours() + 9) % 24;
  for (const t of CACHE_TIERS) {
    const inTier = t.start < t.end
      ? kstHour >= t.start && kstHour < t.end
      : kstHour >= t.start || kstHour < t.end;
    if (inTier) return t.ttlMs;
  }
  return FALLBACK_TTL_MS;
}

export function getCache() { return cache; }
export function setCache(data) { cache = { ts: Date.now(), data }; }
export function isFresh() { return !!cache.data && Date.now() - cache.ts < cacheTtlMs(); }
export function getLastError() { return lastError; }

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

export function isQuotaCooldown() { return Date.now() < quotaCooldownUntil; }
export function getQuotaCooldownUntil() { return quotaCooldownUntil; }

let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  // stat_id 없는 구버전 테이블 교체 (방금 생성된 빈 테이블이므로 DROP 무해)
  await pool.query(`DROP TABLE IF EXISTS charger_usage`);
  await pool.query(`
    CREATE TABLE charger_usage (
      stat_id    VARCHAR(20) NOT NULL,
      chger_id   VARCHAR(20) NOT NULL,
      hour       SMALLINT    NOT NULL,
      count      INTEGER     NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (stat_id, chger_id, hour)
    )
  `);
  tableReady = true;
}

export async function recordUsageDb(stations) {
  try {
    await ensureTable();
    const kstHour = (new Date().getUTCHours() + 9) % 24;
    const rows = stations.flatMap(s =>
      s.chargers.filter(c => c.stat === '3').map(c => [s.station.statId, c.chgerId])
    );
    if (!rows.length) return;
    const statIds  = rows.map(r => r[0]);
    const chgerIds = rows.map(r => r[1]);
    await pool.query(
      `INSERT INTO charger_usage (stat_id, chger_id, hour, count)
       SELECT unnest($1::text[]), unnest($2::text[]), $3::smallint, 1
       ON CONFLICT (stat_id, chger_id, hour)
       DO UPDATE SET count = charger_usage.count + 1, updated_at = NOW()`,
      [statIds, chgerIds, kstHour]
    );
  } catch (e) {
    console.warn('[home-charger] usage record failed:', e.message);
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
  const statIds = getStatIds();
  if (isFresh()) return cache.data;
  if (isQuotaCooldown()) return cache.data; // 쿼터 초과 중엔 호출 억제, 기존 캐시만 사용
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const stations = await loadStations(statIds, key);
      if (stations.length) {
        await recordUsageDb(stations);
        const usage = await fetchUsageDb(stations.map(s => s.station.statId));
        const payload = { stations, fetchedAt: new Date().toISOString(), usage };
        setCache(payload);
        if (stations.length === statIds.length) lastError = null;
        console.log(`[home-charger] warm cache loaded (${stations.length}/${statIds.length} station(s), ${stations.reduce((s,x)=>s+x.chargers.length,0)} chargers)`);
        return payload;
      }
      if (!lastError) lastError = `스테이션 매칭 없음 (요청 ${statIds.join(',')})`;
      return null;
    } catch (e) {
      lastError = e.message || String(e);
      console.warn('[home-charger] warm failed:', lastError);
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
