import { requireAuth } from '@/lib/auth-helper';
import { selectByRange, countByRange, latestFetchedAt } from '@/lib/queries/family-festivals';
import { roundCoord } from '@/lib/geo-privacy';

export const dynamic = 'force-dynamic';

// GET /api/family/festivals?from=YYYYMMDD&to=YYYYMMDD&areaCode=1&size=20
//
// DB(family_festivals) SELECT 만 — 외부 호출 없음.
// 폴링은 GHA cron (월·수·금 03:00 KST) → POST /api/family/festivals/refresh.
// 봇 /festivals + dashboard UI 공용.

function ymdKst(date) {
  const t = date.getTime() + 9 * 3600 * 1000;
  const x = new Date(t);
  return `${x.getUTCFullYear()}${String(x.getUTCMonth() + 1).padStart(2, '0')}${String(x.getUTCDate()).padStart(2, '0')}`;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 3600 * 1000);
}

function isYmd(s) {
  return typeof s === 'string' && /^\d{8}$/.test(s);
}

// 폴링은 주 3회 (월·수·금) → 가장 보수적으로 4일 이상 지났으면 stale.
const STALE_THRESHOLD_MS = 4 * 24 * 3600 * 1000;

export async function GET(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;

  const { searchParams } = new URL(req.url);
  const today = new Date();
  const from = isYmd(searchParams.get('from')) ? searchParams.get('from') : ymdKst(today);
  const to = isYmd(searchParams.get('to')) ? searchParams.get('to') : ymdKst(addDays(today, 30));
  const areaCode = searchParams.get('areaCode') || '';
  const size = Math.min(Math.max(Number(searchParams.get('size')) || 20, 1), 100);

  let festivals = [];
  let totalCount = 0;
  let fetchedAt = null;
  try {
    [festivals, totalCount, fetchedAt] = await Promise.all([
      selectByRange({ from, to, areaCode, size }),
      countByRange({ from, to, areaCode }),
      latestFetchedAt(),
    ]);
  } catch (e) {
    return Response.json(
      { error: `DB 조회 실패: ${e?.message || 'unknown'}` },
      { status: 500 },
    );
  }

  const fetchedAtMs = fetchedAt ? new Date(fetchedAt).getTime() : null;
  const stale = !fetchedAtMs || (Date.now() - fetchedAtMs) > STALE_THRESHOLD_MS;

  // family/SNS 채널 — 좌표 ±100m 라운딩 (개인정보 보호).
  const sanitized = festivals.map((f) => ({
    ...f,
    lat: roundCoord(f.lat, 3),
    lng: roundCoord(f.lng, 3),
  }));

  return Response.json({
    festivals: sanitized,
    totalCount,
    from,
    to,
    areaCode: areaCode || null,
    fetchedAt: fetchedAtMs,
    stale,
  });
}
