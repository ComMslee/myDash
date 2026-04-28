import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

// 진단 전용 — TeslaMate 가 충전 신호를 인지 못 하는 케이스 추적용 raw 덤프.
// /api/charging-status 가 false 인데 실제로는 플러그 꽂혀 있을 때 어디서 끊겼는지 본다.
export async function GET() {
  try {
    const car = await pool.query(`SELECT id, name FROM cars LIMIT 1`);
    if (!car.rows.length) return Response.json({ error: 'no car' });
    const carId = car.rows[0].id;

    const [
      latestState,
      recentStates,
      activeCp,
      recentCps,
      latestPositions,
      latestCharges,
    ] = await Promise.all([
      pool.query(
        `SELECT state, start_date, end_date FROM states
         WHERE car_id = $1 ORDER BY start_date DESC LIMIT 1`,
        [carId]
      ),
      pool.query(
        `SELECT state, start_date, end_date FROM states
         WHERE car_id = $1 ORDER BY start_date DESC LIMIT 5`,
        [carId]
      ),
      pool.query(
        `SELECT id, start_date, end_date, charge_energy_added,
                start_battery_level, end_battery_level
         FROM charging_processes
         WHERE car_id = $1 AND end_date IS NULL
         ORDER BY start_date DESC LIMIT 1`,
        [carId]
      ),
      pool.query(
        `SELECT id, start_date, end_date, charge_energy_added,
                start_battery_level, end_battery_level
         FROM charging_processes
         WHERE car_id = $1
         ORDER BY start_date DESC LIMIT 3`,
        [carId]
      ),
      pool.query(
        `SELECT date, battery_level, power, odometer
         FROM positions
         WHERE car_id = $1
         ORDER BY date DESC LIMIT 5`,
        [carId]
      ),
      pool.query(
        `SELECT c.date, c.battery_level, c.charger_power, c.charging_process_id
         FROM charges c
         JOIN charging_processes cp ON cp.id = c.charging_process_id
         WHERE cp.car_id = $1
         ORDER BY c.date DESC LIMIT 5`,
        [carId]
      ),
    ]);

    const now = new Date();
    const latestPos = latestPositions.rows[0];
    const posAgeSec = latestPos
      ? Math.round((now - new Date(latestPos.date)) / 1000)
      : null;

    return Response.json({
      now: now.toISOString(),
      car_id: carId,
      latest_state: latestState.rows[0] ?? null,
      recent_states: recentStates.rows,
      active_charging_process: activeCp.rows[0] ?? null,
      recent_charging_processes: recentCps.rows,
      latest_positions: latestPositions.rows,
      latest_position_age_sec: posAgeSec,
      latest_charges: latestCharges.rows,
    });
  } catch (err) {
    return Response.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
