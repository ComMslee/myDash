// 집충전기(환경공단 EvCharger) 캐시 모듈
// 라우트와 instrumentation(서버 기동 훅) 모두에서 공유하여 최초 기동 시 캐시를 미리 데운다.

const BASE = 'https://apis.data.go.kr/B552584/EvCharger/getChargerInfo';
const ZCODE = '41';
const MAX_PAGES = 10;
const PAGE_SIZE = 9999;

// KST 시간대별 캐시 TTL. 범위는 [start, end) 이며 start>end이면 자정을 넘어감. Infinity = 갱신 안 함.
const CACHE_TIERS = [
  { start:  6, end: 10, ttlMs:  2 * 60_000 }, // 출근 피크
  { start: 10, end: 17, ttlMs:  5 * 60_000 }, // 낮 안정
  { start: 17, end: 22, ttlMs:  2 * 60_000 }, // 귀가/충전 피크
  { start: 22, end: 24, ttlMs: 30 * 60_000 }, // 저녁~자정
  { start:  0, end:  6, ttlMs: Infinity   }, // 심야 (갱신 안 함)
];
const FALLBACK_TTL_MS = 10 * 60_000;

let cache = { ts: 0, data: null };
let lastHitPage = null;
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

function pickStationFromItems(items, statId) {
  const chargers = [];
  let station = null;
  for (const it of items) {
    if (it.statId !== statId) continue;
    chargers.push({
      chgerId: it.chgerId,
      chgerType: it.chgerType,
      output: Number(it.output) || null,
      stat: it.stat,
      statUpdDt: it.statUpdDt,
      lastTsdt: it.lastTsdt,
      lastTedt: it.lastTedt,
    });
    if (!station) {
      station = {
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
  return { station, chargers };
}

function mergeChargers(target, incoming) {
  const seen = new Set(target.map(c => c.chgerId));
  for (const c of incoming) {
    if (!seen.has(c.chgerId)) {
      target.push(c);
      seen.add(c.chgerId);
    }
  }
}

export async function loadStation(statId, key) {
  // Fast path: remembered hit page
  if (lastHitPage) {
    try {
      const xml = await fetchPage(lastHitPage, key);
      const items = parseItems(xml);
      const { station, chargers } = pickStationFromItems(items, statId);
      if (station && chargers.length) {
        chargers.sort((a, b) => a.chgerId.localeCompare(b.chgerId));
        return { station, chargers };
      }
    } catch (e) {
      console.warn(`[home-charger] fast path (page ${lastHitPage}) failed:`, e.message);
    }
  }

  const results = await Promise.all(
    Array.from({ length: MAX_PAGES }, (_, i) =>
      fetchPage(i + 1, key).then(parseItems).catch(err => {
        console.warn(`[home-charger] page ${i + 1} failed:`, err.message);
        return null;
      })
    )
  );

  const failedPages = results.map((r, i) => r == null ? i + 1 : null).filter(Boolean);
  const merged = [];
  let station = null;
  let hitPage = null;
  for (let i = 0; i < results.length; i++) {
    const items = results[i];
    if (!items) continue;
    const { station: s, chargers } = pickStationFromItems(items, statId);
    if (chargers.length) {
      if (!station) station = s;
      if (hitPage == null) hitPage = i + 1;
      mergeChargers(merged, chargers);
    }
  }

  if (!station && failedPages.length) {
    for (const p of failedPages) {
      try {
        const items = parseItems(await fetchPage(p, key));
        const { station: s, chargers } = pickStationFromItems(items, statId);
        if (chargers.length) {
          station = s;
          hitPage = p;
          mergeChargers(merged, chargers);
          break;
        }
      } catch (e) {
        console.warn(`[home-charger] retry page ${p} failed:`, e.message);
      }
    }
  }

  if (hitPage) lastHitPage = hitPage;
  merged.sort((a, b) => a.chgerId.localeCompare(b.chgerId));
  return { station, chargers: merged };
}

// 캐시가 비었거나 만료된 경우에만 백그라운드 로드. 동시 호출은 inflight로 단일 수행.
export async function warmIfNeeded() {
  const key = process.env.EV_CHARGER_API_KEY;
  const statId = process.env.HOME_CHARGER_STAT_ID || 'PI795111';
  if (!key) return null;
  if (isFresh()) return cache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { station, chargers } = await loadStation(statId, key);
      if (station && chargers.length) {
        const payload = { station, chargers, fetchedAt: new Date().toISOString() };
        setCache(payload);
        console.log(`[home-charger] warm cache loaded (${chargers.length} chargers)`);
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
