import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const carResult = await pool.query(`SELECT id, name FROM cars LIMIT 1`);
    if (carResult.rows.length === 0) {
      return Response.json({ error: 'No car found' }, { status: 404 });
    }

    const car = carResult.rows[0];
    const carId = car.id;

    const [posResult, stateResult, lastChargeResult] = await Promise.all([
      pool.query(
        `SELECT battery_level, est_battery_range_km, rated_battery_range_km, date
         FROM positions WHERE car_id = $1 ORDER BY date DESC LIMIT 1`,
        [carId]
      ),
      pool.query(
        `SELECT state FROM states WHERE car_id = $1 ORDER BY start_date DESC LIMIT 1`,
        [carId]
      ),
      pool.query(
        `SELECT cp.end_date, cp.start_battery_level, cp.end_battery_level,
                g.name AS geofence_name
         FROM charging_processes cp
         LEFT JOIN geofences g ON g.id = cp.geofence_id
         WHERE cp.car_id = $1 AND cp.end_date IS NOT NULL
         ORDER BY cp.end_date DESC LIMIT 1`,
        [carId]
      ),
    ]);

    const pos = posResult.rows[0];
    const currentState = stateResult.rows[0]?.state || 'unknown';

    return Response.json({
      id: carId,
      name: car.name,
      battery_level: pos?.battery_level ?? null,
      est_battery_range: pos?.est_battery_range_km ? parseFloat(pos.est_battery_range_km).toFixed(0) : null,
      rated_battery_range: pos?.rated_battery_range_km ? parseFloat(pos.rated_battery_range_km).toFixed(0) : null,
      state: currentState,
      last_seen: pos?.date ?? null,
      last_charge: lastChargeResult.rows[0] ? {
        end_date: lastChargeResult.rows[0].end_date,
        soc_start: lastChargeResult.rows[0].start_battery_level,
        soc_end: lastChargeResult.rows[0].end_battery_level,
        location: lastChargeResult.rows[0].geofence_name || null,
      } : null,
    });
  } catch (err) {
    console.error('/api/car error:', err);
    return Response.json({ error: 'DB error' }, { status: 500 });
  }
}
