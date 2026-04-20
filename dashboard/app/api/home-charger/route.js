export const dynamic = 'force-dynamic';

const BASE = 'https://apis.data.go.kr/B552584/EvCharger/getChargerInfo';
const ZCODE = '41';
const MAX_PAGES = 10;
const PAGE_SIZE = 9999;
// KST 시간대별 캐시 TTL (분 단위). 범위는 [start, end) 이며 end=start인 구간은 자정을 넘어감.
const CACHE_TIERS = [
  { start:  6, end: 10, ttlMs:  2 * 60_000 }, // 출근 피크
  { start: 10, end: 17, ttlMs: 10 * 60_000 }, // 낮 안정
  { start: 17, end: 22, ttlMs:  2 * 60_000 }, // 귀가/충전 피크
  { start: 22, end:  6, ttlMs: 30 * 60_000 }, // 심야
];
const FALLBACK_TTL_MS = 10 * 60_000;

let cache = { ts: 0, data: null };
let lastHitPage = null;

function cacheTtlMs(now = new Date()) {
  const kstHour = (now.getUTCHours() + 9) % 24;
  for (const t of CACHE_TIERS) {
    const inTier = t.start < t.end
      ? kstHour >= t.start && kstHour < t.end
      : kstHour >= t.start || kstHour < t.end;
    if (inTier) return t.ttlMs;
  }
  return FALLBACK_TTL_MS;
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

async function fetchPage(pageNo, key) {
  const url = new URL(BASE);
  url.searchParams.set('serviceKey', key);
  url.searchParams.set('pageNo', String(pageNo));
  url.searchParams.set('numOfRows', String(PAGE_SIZE));
  url.searchParams.set('zcode', ZCODE);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return res.text();
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

async function loadStation(statId, key) {
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
    } catch {
      // fall through to full scan
    }
  }

  // Parallel full scan
  const results = await Promise.all(
    Array.from({ length: MAX_PAGES }, (_, i) =>
      fetchPage(i + 1, key).then(parseItems).catch(() => null)
    )
  );

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
  if (hitPage) lastHitPage = hitPage;
  merged.sort((a, b) => a.chgerId.localeCompare(b.chgerId));
  return { station, chargers: merged };
}

export async function GET() {
  const key = process.env.EV_CHARGER_API_KEY;
  const statId = process.env.HOME_CHARGER_STAT_ID || 'PI795111';
  if (!key) {
    return Response.json({ error: 'EV_CHARGER_API_KEY 미설정' }, { status: 503 });
  }
  const now = Date.now();
  if (cache.data && now - cache.ts < cacheTtlMs()) {
    return Response.json(cache.data);
  }
  try {
    const { station, chargers } = await loadStation(statId, key);
    if (!station) return Response.json({ error: '스테이션을 찾지 못했습니다.' }, { status: 404 });
    const payload = { station, chargers, fetchedAt: new Date().toISOString() };
    cache = { ts: now, data: payload };
    return Response.json(payload);
  } catch (e) {
    return Response.json({ error: e.message || '조회 실패' }, { status: 500 });
  }
}
