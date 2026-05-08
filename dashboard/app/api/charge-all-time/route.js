import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';

export const dynamic = 'force-dynamic';

export async function GET() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  try {
    const car = await getDefaultCar();
    if (!car) return Response.json({ error: 'No car found' }, { status: 404 });
    const carId = car.id;

    const [statsResult, hourDowResult, hourSocResult] = await Promise.all([
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

      pool.query(`
        SELECT EXTRACT(DOW  FROM (start_date + INTERVAL '9 hours'))::int AS dow,
               EXTRACT(HOUR FROM (start_date + INTERVAL '9 hours'))::int AS hour,
               COUNT(*)::int AS count
        FROM charging_processes
        WHERE car_id = $1 AND charge_energy_added IS NOT NULL
        GROUP BY dow, hour
      `, [carId]),

      pool.query(`
        SELECT EXTRACT(HOUR FROM (start_date + INTERVAL '9 hours'))::int AS hour,
               AVG(start_battery_level)::float AS avg_start,
               AVG(end_battery_level)::float AS avg_end
        FROM charging_processes
        WHERE car_id = $1
          AND charge_energy_added IS NOT NULL
          AND start_battery_level IS NOT NULL
          AND end_battery_level IS NOT NULL
        GROUP BY hour
      `, [carId]),
    ]);

    const s = statsResult.rows[0];

    const hourDow = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const r of hourDowResult.rows) hourDow[r.dow][r.hour] = r.count;

    const hourSoc = Array.from({ length: 24 }, () => ({ avg_start: null, avg_end: null }));
    for (const r of hourSocResult.rows) {
      hourSoc[r.hour] = {
        avg_start: r.avg_start != null ? Number(r.avg_start) : null,
        avg_end:   r.avg_end   != null ? Number(r.avg_end)   : null,
      };
    }

    return Response.json({
      charge_count: s.charge_count,
      total_kwh: parseFloat(Number(s.total_kwh).toFixed(1)),
      avg_kwh: parseFloat(Number(s.avg_kwh).toFixed(1)),
      home_charges: s.home_charges,
      other_charges: s.other_charges,
      fast_charges: s.fast_charges,
      slow_charges: s.slow_charges,
      charge_hour_dow: hourDow,
      charge_hour_soc: hourSoc,
    });
  } catch (err) {
    console.error('/api/charge-all-time error:', err);
    return Response.json({ error: 'DB error' }, { status: 500 });
  }
}
