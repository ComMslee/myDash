import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';

export const dynamic = 'force-dynamic';

// drives + charging_processes 일자 집계 — 봇 /today /yesterday /week 공용.
// range: today | yesterday | week (지난 7일, 오늘 포함).

const KST_OFFSET_MS = 9 * 3600 * 1000;
function kstStartOfTodayUtc() {
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  return new Date(Date.UTC(
    nowKst.getUTCFullYear(),
    nowKst.getUTCMonth(),
    nowKst.getUTCDate(),
  ) - KST_OFFSET_MS);
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
    let start, end = null;
    if (range === 'today') start = today;
    else if (range === 'yesterday') { start = new Date(today.getTime() - 86_400_000); end = today; }
    else if (range === 'week') start = new Date(today.getTime() - 6 * 86_400_000);
    else return Response.json({ error: 'bad range' }, { status: 400 });

    const where = end ? 'start_date >= $2 AND start_date < $3' : 'start_date >= $2';
    const params = end ? [car.id, start, end] : [car.id, start];

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

    return Response.json({
      range,
      drives: drives.rows[0],
      charges: charges.rows[0],
    });
  } catch (e) {
    console.error('/api/summary error:', e);
    return Response.json({ error: 'DB error', detail: e.message }, { status: 500 });
  }
}
