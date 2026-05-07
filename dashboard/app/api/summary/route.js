import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';

export const dynamic = 'force-dynamic';

// drives + charging_processes 일자 집계 — 봇 /today /yesterday /week /period 공용.
// range:
//   today        오늘 (KST 자정~)
//   yesterday    어제 (KST)
//   week         지난 7일 (오늘 포함)
//   this-week    이번 주 (KST 월요일~오늘)
//   last-week    지난 주 (KST 월요일~일요일)
//   month        이번 달 (KST 1일~오늘)
//   multi        today + this-week + last-week + month 한 번에 — 봇 /period 용.

const KST_OFFSET_MS = 9 * 3600 * 1000;

function kstStartOfTodayUtc() {
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  return new Date(Date.UTC(
    nowKst.getUTCFullYear(),
    nowKst.getUTCMonth(),
    nowKst.getUTCDate(),
  ) - KST_OFFSET_MS);
}

// KST 기준 이번 주 월요일 자정 UTC.
function kstStartOfThisWeekUtc() {
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  const dow = nowKst.getUTCDay(); // 0=일, 1=월, ..., 6=토
  const offsetToMon = dow === 0 ? -6 : 1 - dow;
  return new Date(Date.UTC(
    nowKst.getUTCFullYear(),
    nowKst.getUTCMonth(),
    nowKst.getUTCDate() + offsetToMon,
  ) - KST_OFFSET_MS);
}

// KST 기준 이번 달 1일 자정 UTC.
function kstStartOfThisMonthUtc() {
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  return new Date(Date.UTC(
    nowKst.getUTCFullYear(),
    nowKst.getUTCMonth(),
    1,
  ) - KST_OFFSET_MS);
}

function rangeBounds(range, today) {
  switch (range) {
    case 'today':     return [today, null];
    case 'yesterday': return [new Date(today.getTime() - 86_400_000), today];
    case 'week':      return [new Date(today.getTime() - 6 * 86_400_000), null];
    case 'this-week': return [kstStartOfThisWeekUtc(), null];
    case 'last-week': {
      const thisMon = kstStartOfThisWeekUtc();
      const lastMon = new Date(thisMon.getTime() - 7 * 86_400_000);
      return [lastMon, thisMon];
    }
    case 'month':     return [kstStartOfThisMonthUtc(), null];
    default:          return null;
  }
}

async function aggregateRange(carId, start, end) {
  const where = end ? 'start_date >= $2 AND start_date < $3' : 'start_date >= $2';
  const params = end ? [carId, start, end] : [carId, start];
  const [drives, charges] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS n,
              COALESCE(SUM(distance), 0)::float AS km,
              COALESCE(SUM(duration_min), 0)::int AS dur
       FROM drives WHERE car_id = $1 AND ${where}`,
      params,
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n,
              COALESCE(SUM(charge_energy_added), 0)::float AS kwh
       FROM charging_processes WHERE car_id = $1 AND ${where}`,
      params,
    ),
  ]);
  return { drives: drives.rows[0], charges: charges.rows[0] };
}

export async function GET(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  try {
    const { searchParams } = new URL(req.url);
    const range = (searchParams.get('range') || 'today').toLowerCase();

    const car = await getDefaultCar();
    if (!car) return Response.json({ error: 'No car found' }, { status: 404 });

    const today = kstStartOfTodayUtc();

    // multi: today + this-week + last-week + month 한 번에.
    if (range === 'multi') {
      const ranges = ['today', 'this-week', 'last-week', 'month'];
      const out = {};
      await Promise.all(ranges.map(async (r) => {
        const b = rangeBounds(r, today);
        if (!b) return;
        out[r.replace('-', '_')] = await aggregateRange(car.id, b[0], b[1]);
      }));
      return Response.json({ range: 'multi', ...out });
    }

    const b = rangeBounds(range, today);
    if (!b) return Response.json({ error: 'bad range' }, { status: 400 });

    const agg = await aggregateRange(car.id, b[0], b[1]);
    return Response.json({ range, ...agg });
  } catch (e) {
    console.error('/api/summary error:', e);
    return Response.json({ error: 'DB error', detail: e.message }, { status: 500 });
  }
}
