import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const carResult = await pool.query(`SELECT id FROM cars LIMIT 1`);
    if (carResult.rows.length === 0) return Response.json({ error: 'No car found' }, { status: 404 });
    const carId = carResult.rows[0].id;

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

      pool.query(`
        SELECT EXTRACT(DOW  FROM (start_date + INTERVAL '9 hours'))::int AS dow,
               EXTRACT(HOUR FROM (start_date + INTERVAL '9 hours'))::int AS hour,
               COUNT(*)::int AS count
        FROM charging_processes
        WHERE car_id = $1 AND charge_energy_added IS NOT NULL
        GROUP BY dow, hour
      `, [carId]),
    ]);

    const s = statsResult.rows[0];

    const hourDow = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const r of hourDowResult.rows) hourDow[r.dow][r.hour] = r.count;

    return Response.json({
      charge_count: s.charge_count,
      total_kwh: parseFloat(Number(s.total_kwh).toFixed(1)),
      avg_kwh: parseFloat(Number(s.avg_kwh).toFixed(1)),
      home_charges: s.home_charges,
      other_charges: s.other_charges,
      fast_charges: s.fast_charges,
      slow_charges: s.slow_charges,
      charge_hour_dow: hourDow,
    });
  } catch (err) {
    console.error('/api/charge-all-time error:', err);
    return Response.json({ error: 'DB error' }, { status: 500 });
  }
}
