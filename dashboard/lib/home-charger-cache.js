// 집충전기(환경공단 EvCharger) 캐시 모듈 — 여러 스테이션을 한 번의 페이지 스캔으로 수집.
// route + instrumentation에서 공유.

const BASE = 'https://apis.data.go.kr/B552584/EvCharger/getChargerInfo';
const ZCODE = '41';
const MAX_PAGES = 10;
const PAGE_SIZE = 9999;

// 공공 API 일일 쿼터 1,000회/일 고려하여 보수적 TTL
const CACHE_TIERS = [
  { start:  6, end: 10, ttlMs:  5 * 60_000 }, // 출근 피크
  { start: 10, end: 17, ttlMs: 10 * 60_000 }, // 낮 안정
  { start: 17, end: 22, ttlMs:  5 * 60_000 }, // 귀가/충전 피크
  { start: 22, end: 24, ttlMs: 30 * 60_000 }, // 저녁~자정
  { start:  0, end:  6, ttlMs: Infinity   }, // 심야 (갱신 안 함)
];
const FALLBACK_TTL_MS = 15 * 60_000;

let cache = { ts: 0, data: null };
let inflight = null;
let lastError = null; // 마지막 로드 실패 사유 (UI 표시용)
const lastHitPage = new Map(); // statId → 이전에 찾은 페이지 번호 (API 호출 절약)

export function getLastError() { return lastError; }

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
  const text = await res.text();
  // 환경공단 에러 응답 감지 (쿼터 초과/인증 실패 등): <item> 없이 에러 XML 반환
  const errMsg = /<errMsg>([^<]+)<\/errMsg>/.exec(text)?.[1]?.trim();
  const authMsg = /<returnAuthMsg>([^<]+)<\/returnAuthMsg>/.exec(text)?.[1]?.trim();
  if (errMsg && errMsg !== 'NORMAL SERVICE.') {
    throw new Error(`API ${errMsg}${authMsg ? ` / ${authMsg}` : ''}`);
  }
  return text;
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

  // Fast path: 이전에 찾은 페이지부터 먼저 시도 (중복 제거)
  const knownPages = [...new Set(statIds.map(id => lastHitPage.get(id)).filter(Boolean))];
  const visitedPages = new Set();
  for (const p of knownPages) {
    visitedPages.add(p);
    try {
      const items = parseItems(await fetchPage(p, key));
      collectStations(items, statIdSet, bucket);
    } catch (e) {
      console.warn(`[home-charger] fast path page ${p} failed:`, e.message);
    }
  }
  // fast path으로 모두 채워졌으면 전체 스캔 생략 → API 호출 1~N회
  const missing = () => statIds.filter(id => !bucket.get(id).station);
  if (!missing().length) {
    for (const id of statIds) {
      bucket.get(id).chargers.sort((a, b) => a.chgerId.localeCompare(b.chgerId));
    }
    return statIds.map(id => bucket.get(id)).filter(s => s.station && s.chargers.length);
  }

  // 전체 스캔 (fast path 실패 또는 신규 statId)
  const pageIndices = Array.from({ length: MAX_PAGES }, (_, i) => i + 1).filter(p => !visitedPages.has(p));
  const results = await Promise.all(
    pageIndices.map(p =>
      fetchPage(p, key).then(xml => ({ p, items: parseItems(xml) })).catch(err => {
        console.warn(`[home-charger] page ${p} failed:`, err.message);
        return { p, items: null };
      })
    )
  );

  const failedPages = results.filter(r => r.items == null).map(r => r.p);
  for (const { p, items } of results) {
    if (!items) continue;
    const before = new Map(statIds.map(id => [id, bucket.get(id).station]));
    collectStations(items, statIdSet, bucket);
    // 새로 찾은 statId의 페이지 번호 기록
    for (const id of statIds) {
      if (!before.get(id) && bucket.get(id).station) lastHitPage.set(id, p);
    }
  }

  if (missing().length && failedPages.length) {
    for (const p of failedPages) {
      if (!missing().length) break;
      try {
        const items = parseItems(await fetchPage(p, key));
        const before = new Map(statIds.map(id => [id, bucket.get(id).station]));
        collectStations(items, statIdSet, bucket);
        for (const id of statIds) {
          if (!before.get(id) && bucket.get(id).station) lastHitPage.set(id, p);
        }
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
        lastError = null;
        console.log(`[home-charger] warm cache loaded (${stations.length} station(s), ${stations.reduce((s,x)=>s+x.chargers.length,0)} chargers)`);
        return payload;
      }
      lastError = `스테이션 매칭 없음 (요청 ${statIds.join(',')})`;
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
