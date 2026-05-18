import { requireAuth } from '@/lib/auth-helper';
import { selectByYear, getMeta, replaceYear } from '@/lib/queries/holidays';
import { KST_OFFSET_MS } from '@/lib/kst';

export const dynamic = 'force-dynamic';

// GET /api/holidays?year=YYYY
//
// 한국 공휴일 목록 (KASI 특일정보 lazy 캐시).
// year 미지정 → 현재 연도(KST).
// DB(dash_holidays) 우선, 캐시 없거나 fetched_at > 30일 → KASI getRestDeInfo 호출 후 upsert.
// HOLIDAY_API_KEY (data.go.kr 발급 — TOUR_API_KEY 와 동일 키 사용 가능, API 등록만 추가) 미설정이면 DB 캐시만 반환.

const KASI_ENDPOINT = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo';
const FETCH_TIMEOUT_MS = 10_000;
const STALE_THRESHOLD_MS = 30 * 24 * 3600 * 1000;

function currentYearKst() {
  const t = Date.now() + KST_OFFSET_MS;
  return new Date(t).getUTCFullYear();
}

async function fetchKasi(year, apiKey) {
  const all = [];
  for (let month = 1; month <= 12; month += 1) {
    const url = new URL(KASI_ENDPOINT);
    url.searchParams.set('serviceKey', apiKey);
    url.searchParams.set('solYear', String(year));
    url.searchParams.set('solMonth', String(month).padStart(2, '0'));
    url.searchParams.set('numOfRows', '50');
    url.searchParams.set('_type', 'json');
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`KASI ${res.status}: ${text.slice(0, 120)}`);
    }
    const json = await res.json();
    const header = json?.response?.header;
    if (header?.resultCode && header.resultCode !== '00' && header.resultCode !== '0000') {
      throw new Error(`KASI ${header.resultCode}: ${header.resultMsg || ''}`);
    }
    const raw = json?.response?.body?.items?.item;
    const items = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    for (const it of items) {
      const locdate = String(it.locdate || '');
      if (!/^\d{8}$/.test(locdate)) continue;
      all.push({
        dateymd: locdate,
        name: String(it.dateName || '').trim(),
        isHoliday: String(it.isHoliday || 'Y').toUpperCase() === 'Y',
      });
    }
  }
  return all;
}

export async function GET(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;

  const { searchParams } = new URL(req.url);
  const yearStr = searchParams.get('year');
  const year = /^\d{4}$/.test(yearStr || '') ? parseInt(yearStr, 10) : currentYearKst();
  const force = searchParams.get('refresh') === '1';

  const apiKey = process.env.HOLIDAY_API_KEY || process.env.TOUR_API_KEY || '';

  let fetchedAt = null;
  let stale = true;
  try {
    fetchedAt = await getMeta(year);
    stale = !fetchedAt || (Date.now() - new Date(fetchedAt).getTime()) > STALE_THRESHOLD_MS;
  } catch (e) {
    return Response.json({ error: `DB 메타 조회 실패: ${e?.message || 'unknown'}` }, { status: 500 });
  }

  let refreshError = null;
  if (apiKey && (force || stale)) {
    try {
      const fetched = await fetchKasi(year, apiKey);
      if (fetched.length > 0) {
        await replaceYear(year, fetched);
        fetchedAt = new Date();
        stale = false;
      }
    } catch (e) {
      refreshError = e?.message || 'unknown';
    }
  }

  let rows = [];
  try {
    rows = await selectByYear(year);
  } catch (e) {
    return Response.json({ error: `DB 조회 실패: ${e?.message || 'unknown'}` }, { status: 500 });
  }

  return Response.json({
    year,
    holidays: rows.map(r => ({ dateymd: r.dateymd, name: r.name })),
    fetchedAt: fetchedAt ? new Date(fetchedAt).getTime() : null,
    stale,
    refreshError,
    apiKeyMissing: !apiKey,
  });
}
