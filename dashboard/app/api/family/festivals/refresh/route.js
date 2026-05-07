import { requireAuth, assertSameOrigin } from '@/lib/auth-helper';
import { upsertMany, cleanupExpired } from '@/lib/queries/family-festivals';

export const dynamic = 'force-dynamic';

// POST /api/family/festivals/refresh
//
// TourAPI 풀-페이지네이션 폴링 → DB upsert + 만료분 cleanup.
// 호출원: GHA cron (월·수·금 03:00 KST) — `.github/workflows/refresh-festivals.yml`.
// 인증: HUB_SHARED_SECRET (requireAuth).
//
// 범위: 오늘(KST) ~ +90일 전국. 페이지당 100건, 최대 20페이지(=2000건) 안전장치.
// TourAPI 장애 시 부분 적재 가능 — 다음 폴링이 보정.

const TOUR_ENDPOINT = 'https://apis.data.go.kr/B551011/KorService2/searchFestival2';
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const FETCH_TIMEOUT_MS = 12_000;
const HORIZON_DAYS = 90;

function ymdKst(date) {
  const t = date.getTime() + 9 * 3600 * 1000;
  const x = new Date(t);
  return `${x.getUTCFullYear()}${String(x.getUTCMonth() + 1).padStart(2, '0')}${String(x.getUTCDate()).padStart(2, '0')}`;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 3600 * 1000);
}

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

async function fetchPage({ apiKey, from, to, pageNo }) {
  const url = new URL(TOUR_ENDPOINT);
  url.searchParams.set('serviceKey', apiKey);
  url.searchParams.set('MobileOS', 'ETC');
  url.searchParams.set('MobileApp', 'YeHome');
  url.searchParams.set('_type', 'json');
  url.searchParams.set('arrange', 'A');
  url.searchParams.set('numOfRows', String(PAGE_SIZE));
  url.searchParams.set('pageNo', String(pageNo));
  url.searchParams.set('eventStartDate', from);
  url.searchParams.set('eventEndDate', to);

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`TourAPI ${res.status}: ${text.slice(0, 120)}`);
  }
  const json = await res.json();
  const header = json?.response?.header;
  if (header?.resultCode && header.resultCode !== '0000' && header.resultCode !== '00') {
    throw new Error(`TourAPI ${header.resultCode}: ${header.resultMsg || ''}`);
  }
  const body = json?.response?.body || {};
  const raw = body?.items?.item;
  const items = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  return {
    items,
    totalCount: Number(body.totalCount) || 0,
  };
}

export async function POST(req) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;

  const apiKey = process.env.TOUR_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'TOUR_API_KEY 미설정' }, { status: 503 });
  }

  const today = new Date();
  const from = ymdKst(today);
  const to = ymdKst(addDays(today, HORIZON_DAYS));

  const allItems = [];
  let totalCount = 0;
  let fetchedPages = 0;
  const errors = [];

  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo += 1) {
    let page;
    try {
      page = await fetchPage({ apiKey, from, to, pageNo });
    } catch (e) {
      errors.push(`page ${pageNo}: ${e?.message || 'unknown'}`);
      break;
    }
    fetchedPages += 1;
    if (pageNo === 1) totalCount = page.totalCount;
    allItems.push(...page.items);
    if (page.items.length < PAGE_SIZE) break;
    if (allItems.length >= totalCount) break;
  }

  const normalized = allItems.map(normalize).filter((r) => r.id && r.startDate && r.endDate);

  let upserted = 0;
  let upsertError = null;
  if (normalized.length > 0) {
    try {
      upserted = await upsertMany(normalized);
    } catch (e) {
      upsertError = e?.message || 'unknown';
    }
  }

  let deleted = 0;
  try {
    deleted = await cleanupExpired(from);
  } catch (e) {
    errors.push(`cleanup: ${e?.message || 'unknown'}`);
  }

  const ok = !upsertError && errors.length === 0 && fetchedPages > 0;
  return Response.json(
    {
      ok,
      from,
      to,
      fetchedPages,
      totalCount,
      received: allItems.length,
      upserted,
      deleted,
      errors,
      upsertError,
    },
    { status: ok ? 200 : 502 },
  );
}
