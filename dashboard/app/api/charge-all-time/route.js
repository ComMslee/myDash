import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';
import { withCache } from '@/lib/server-cache';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const force = new URL(request.url).searchParams.get('refresh') === '1';
  try {
    const car = await getDefaultCar();
    if (!car) return Response.json({ error: 'No car found' }, { status: 404 });
    const carId = car.id;

    return Response.json(await withCache(`charge-all-time:${carId}`, 600_000, async () => {
    const [statsResult, hourDowResult] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int AS charge_count,
          COALESCE(SUM(charge_energy_added), 0)::float AS total_kwh,
          COALESCE(AVG(charge_energy_added), 0)::float AS avg_kwh,
          COUNT(*) FILTER (WHERE geofence_id IS NOT NULL)::int AS home_charges,
          COUNT(*) FILTER (WHERE geofence_id IS NULL)::int AS other_charges,
          COUNT(*) FILTER (WHERE is_fast = true)::int AS fast_charges,
          COUNT(*) FILTER (WHERE is_fast IS DISTINCT FROM true)::int AS slow_charges
        FROM (
          SELECT cp.charge_energy_added, cp.geofence_id,
                 COALESCE(BOOL_OR(c.fast_charger_present), false) AS is_fast
          FROM charging_processes cp
          LEFT JOIN charges c ON c.charging_process_id = cp.id
          WHERE cp.car_id = $1 AND cp.charge_energy_added IS NOT NULL
          GROUP BY cp.id, cp.charge_energy_added, cp.geofence_id
        ) sub
      `, [carId]),

      // 충전 (요일 × 시간) — 슬롯 내 점유 분 ÷ 10 올림 (0~10→1, 11~20→2, ..., 51~60→6)
      pool.query(`
        SELECT EXTRACT(DOW  FROM hour_start)::int AS dow,
               EXTRACT(HOUR FROM hour_start)::int AS hour,
               SUM(CEIL(
                 EXTRACT(EPOCH FROM (
                   LEAST(el, hour_start + INTERVAL '1 hour')
                   - GREATEST(sl, hour_start)
                 )) / 600.0
               ))::int AS count
        FROM (
          SELECT start_date + INTERVAL '9 hours' AS sl,
                 COALESCE(end_date, start_date) + INTERVAL '9 hours' AS el
          FROM charging_processes
          WHERE car_id = $1 AND charge_energy_added IS NOT NULL
        ) c
        CROSS JOIN LATERAL generate_series(
          date_trunc('hour', sl),
          date_trunc('hour', el),
          INTERVAL '1 hour'
        ) AS hour_start
        WHERE LEAST(el, hour_start + INTERVAL '1 hour') > GREATEST(sl, hour_start)
        GROUP BY dow, hour
      `, [carId]),
    ]);

    const s = statsResult.rows[0];

    const hourDow = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const r of hourDowResult.rows) hourDow[r.dow][r.hour] = r.count;

    return {
      charge_count: s.charge_count,
      total_kwh: parseFloat(Number(s.total_kwh).toFixed(1)),
      avg_kwh: parseFloat(Number(s.avg_kwh).toFixed(1)),
      home_charges: s.home_charges,
      other_charges: s.other_charges,
      fast_charges: s.fast_charges,
      slow_charges: s.slow_charges,
      charge_hour_dow: hourDow,
    };
    }, { force }));
  } catch (err) {
    console.error('/api/charge-all-time error:', err);
    return Response.json({ error: 'DB error' }, { status: 500 });
  }
}
