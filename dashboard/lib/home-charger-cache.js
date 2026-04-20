// 집충전기(환경공단 EvCharger) 캐시 모듈 — 여러 스테이션을 한 번의 페이지 스캔으로 수집.
// route + instrumentation에서 공유.

const BASE = 'https://apis.data.go.kr/B552584/EvCharger/getChargerInfo';
const ZCODE = '41';
const MAX_PAGES = 10;
const PAGE_SIZE = 9999;

const CACHE_TIERS = [
  { start:  6, end: 10, ttlMs:  2 * 60_000 },
  { start: 10, end: 17, ttlMs:  5 * 60_000 },
  { start: 17, end: 22, ttlMs:  2 * 60_000 },
  { start: 22, end: 24, ttlMs: 30 * 60_000 },
  { start:  0, end:  6, ttlMs: Infinity   },
];
const FALLBACK_TTL_MS = 10 * 60_000;

let cache = { ts: 0, data: null };
let inflight = null;

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

async function fetchPageOnce(pageNo, key) {
  const url = new URL(BASE);
  url.searchParams.set('serviceKey', key);
  url.searchParams.set('pageNo', String(pageNo));
  url.searchParams.set('numOfRows', String(PAGE_SIZE));
  url.searchParams.set('zcode', ZCODE);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return res.text();
}

async function fetchPage(pageNo, key) {
  try {
    return await fetchPageOnce(pageNo, key);
  } catch (e) {
    await new Promise(r => setTimeout(r, 200 + Math.random() * 400));
    return fetchPageOnce(pageNo, key);
  }
}

function collectStations(items, statIdSet, bucket) {
  for (const it of items) {
    if (!statIdSet.has(it.statId)) continue;
    const slot = bucket.get(it.statId);
    slot.chargers.push({
      chgerId: it.chgerId,
      chgerType: it.chgerType,
      output: Number(it.output) || null,
      stat: it.stat,
      statUpdDt: it.statUpdDt,
      lastTsdt: it.lastTsdt,
      lastTedt: it.lastTedt,
    });
    if (!slot.station) {
      slot.station = {
        statId: it.statId,
        statNm: it.statNm,
        addr: [it.addr, it.addrDetail].filter(v => v && v !== 'null').join(' '),
        lat: Number(it.lat) || null,
        lng: Number(it.lng) || null,
        busiNm: it.busiNm,
        useTime: it.useTime,
        parkingFree: it.parkingFree === 'Y',
      };
    }
  }
}

export async function loadStations(statIds, key) {
  const statIdSet = new Set(statIds);
  const bucket = new Map();
  for (const id of statIds) bucket.set(id, { station: null, chargers: [] });

  const results = await Promise.all(
    Array.from({ length: MAX_PAGES }, (_, i) =>
      fetchPage(i + 1, key).then(parseItems).catch(err => {
        console.warn(`[home-charger] page ${i + 1} failed:`, err.message);
        return null;
      })
    )
  );

  const failedPages = results.map((r, i) => r == null ? i + 1 : null).filter(Boolean);
  for (const items of results) {
    if (items) collectStations(items, statIdSet, bucket);
  }

  // 아직 못 찾은 statId가 있고 실패 페이지가 있으면 순차 재시도
  const missing = () => statIds.filter(id => !bucket.get(id).station);
  if (missing().length && failedPages.length) {
    for (const p of failedPages) {
      if (!missing().length) break;
      try {
        collectStations(parseItems(await fetchPage(p, key)), statIdSet, bucket);
      } catch (e) {
        console.warn(`[home-charger] retry page ${p} failed:`, e.message);
      }
    }
  }

  const stations = [];
  for (const id of statIds) {
    const slot = bucket.get(id);
    if (slot.station && slot.chargers.length) {
      slot.chargers.sort((a, b) => a.chgerId.localeCompare(b.chgerId));
      stations.push(slot);
    }
  }
  return stations;
}

export async function warmIfNeeded() {
  const key = process.env.EV_CHARGER_API_KEY;
  if (!key) return null;
  const statIds = getStatIds();
  if (isFresh()) return cache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const stations = await loadStations(statIds, key);
      if (stations.length) {
        const payload = { stations, fetchedAt: new Date().toISOString() };
        setCache(payload);
        console.log(`[home-charger] warm cache loaded (${stations.length} station(s), ${stations.reduce((s,x)=>s+x.chargers.length,0)} chargers)`);
        return payload;
      }
      return null;
    } catch (e) {
      console.warn('[home-charger] warm failed:', e.message);
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
