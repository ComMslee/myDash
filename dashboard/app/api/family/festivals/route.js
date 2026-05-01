import { requireAuth } from '@/lib/auth-helper';

export const dynamic = 'force-dynamic';

// 한국관광공사 TourAPI 4.0 — searchFestival2 래핑.
// 봇 /festivals + dashboard UI 공용. 외부 호출은 여기 단일.
//
// 쿼리: from=YYYYMMDD&to=YYYYMMDD&areaCode=1&size=20
//   - from/to 미지정 시: 오늘 ~ +30일 (KST).
//   - areaCode 미지정 시: 전국.
// 응답: { festivals: [...정규화...], totalCount, fetchedAt, stale }

const TOUR_ENDPOINT = 'https://apis.data.go.kr/B551011/KorService2/searchFestival2';

// LRU 캐시 — 동일 (from,to,area) 30분 TTL.
// TourAPI 일일 트래픽 보호. 패턴: route-map LRU 와 동일 (CLAUDE.md "함정" 참고).
const CACHE_CAPACITY = 64;
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map(); // key: 'from|to|area' → { fetchedAt, payload }

function cacheGet(key) {
  if (!cache.has(key)) return null;
  const entry = cache.get(key);
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, entry); // promote
  return entry;
}

function cacheSet(key, payload) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { fetchedAt: Date.now(), payload });
  while (cache.size > CACHE_CAPACITY) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

function ymdKst(date) {
  const t = date.getTime() + 9 * 3600 * 1000;
  const x = new Date(t);
  const Y = x.getUTCFullYear();
  const M = String(x.getUTCMonth() + 1).padStart(2, '0');
  const D = String(x.getUTCDate()).padStart(2, '0');
  return `${Y}${M}${D}`;
}

function addDaysKst(date, days) {
  return new Date(date.getTime() + days * 24 * 3600 * 1000);
}

function isYmd(s) {
  return typeof s === 'string' && /^\d{8}$/.test(s);
}

// TourAPI 응답 → 정규화. items 가 객체 1개면 배열 아닌 그대로 와서 분기 필요.
function normalize(item) {
  const num = (v) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    id: item.contentid || null,
    title: item.title || '',
    startDate: item.eventstartdate || null,
    endDate: item.eventenddate || null,
    addr: [item.addr1, item.addr2].filter(Boolean).join(' ').trim() || null,
    areaCode: item.areacode || null,
    sigunguCode: item.sigungucode || null,
    lat: num(item.mapy),
    lng: num(item.mapx),
    image: item.firstimage || null,
    thumbnail: item.firstimage2 || null,
    tel: item.tel || null,
  };
}

export async function GET(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;

  const apiKey = process.env.TOUR_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'TOUR_API_KEY 미설정' }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const today = new Date();
  const from = isYmd(searchParams.get('from')) ? searchParams.get('from') : ymdKst(today);
  const to = isYmd(searchParams.get('to')) ? searchParams.get('to') : ymdKst(addDaysKst(today, 30));
  const areaCode = searchParams.get('areaCode') || '';
  const size = Math.min(Math.max(Number(searchParams.get('size')) || 20, 1), 100);

  const key = `${from}|${to}|${areaCode}|${size}`;
  const hit = cacheGet(key);
  if (hit) {
    return Response.json({ ...hit.payload, fetchedAt: hit.fetchedAt, stale: false, cached: true });
  }

  const url = new URL(TOUR_ENDPOINT);
  url.searchParams.set('serviceKey', apiKey);
  url.searchParams.set('MobileOS', 'ETC');
  url.searchParams.set('MobileApp', 'YeHome');
  url.searchParams.set('_type', 'json');
  url.searchParams.set('arrange', 'A'); // 제목순
  url.searchParams.set('numOfRows', String(size));
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('eventStartDate', from);
  if (isYmd(to)) url.searchParams.set('eventEndDate', to);
  if (areaCode) url.searchParams.set('areaCode', areaCode);

  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }, // EV_CHARGER 와 동일 함정 — 기본 UA 차단 가능성 회피.
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
  } catch (e) {
    return Response.json(
      { error: `TourAPI fetch 실패: ${e?.message || 'unknown'}` },
      { status: 502 },
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return Response.json(
      { error: `TourAPI ${res.status}`, detail: text.slice(0, 200) },
      { status: 502 },
    );
  }

  let json;
  try {
    json = await res.json();
  } catch (e) {
    const text = await res.text().catch(() => '');
    return Response.json(
      { error: 'TourAPI 응답 파싱 실패', detail: text.slice(0, 200) },
      { status: 502 },
    );
  }

  const header = json?.response?.header;
  if (header?.resultCode && header.resultCode !== '0000' && header.resultCode !== '00') {
    return Response.json(
      { error: `TourAPI ${header.resultCode}: ${header.resultMsg || ''}` },
      { status: 502 },
    );
  }

  const body = json?.response?.body || {};
  const rawItems = body?.items?.item;
  const items = Array.isArray(rawItems) ? rawItems : (rawItems ? [rawItems] : []);
  const festivals = items.map(normalize);
  const totalCount = Number(body.totalCount) || festivals.length;

  const payload = { festivals, totalCount, from, to, areaCode: areaCode || null };
  cacheSet(key, payload);

  return Response.json({ ...payload, fetchedAt: Date.now(), stale: false, cached: false });
}
