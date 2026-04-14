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

    const [posResult, stateResult] = await Promise.all([
      pool.query(
        `SELECT battery_level, est_battery_range_km, date
         FROM positions WHERE car_id = $1 ORDER BY date DESC LIMIT 1`,
        [carId]
      ),
      pool.query(
        `SELECT state FROM states WHERE car_id = $1 ORDER BY start_date DESC LIMIT 1`,
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
      state: currentState,
      last_seen: pos?.date ?? null,
    });
  } catch (err) {
    console.error('/api/car error:', err);
    return Response.json({ error: 'DB error' }, { status: 500 });
  }
}
