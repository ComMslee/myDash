import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

// 최근 이 시간(초) 안의 positions.power < 0 이면 충전 중으로 간주 (폴백)
const FALLBACK_WINDOW_SEC = 180;
const FALLBACK_POWER_THRESHOLD = -0.1; // kW (충전=음수)

export async function GET() {
  try {
    const carResult = await pool.query(`SELECT id FROM cars LIMIT 1`);
    if (carResult.rows.length === 0) {
      return Response.json({ charging: false });
    }
    const carId = carResult.rows[0].id;

    // Find active charging process (no end_date)
    const activeResult = await pool.query(
      `SELECT id, start_date, charge_energy_added
       FROM charging_processes
       WHERE car_id = $1 AND end_date IS NULL
       ORDER BY start_date DESC
       LIMIT 1`,
      [carId]
    );

    if (activeResult.rows.length > 0) {
      const activeProcess = activeResult.rows[0];

      // Get latest charge detail
      const chargeDetail = await pool.query(
        `SELECT charger_power, time_to_full_charge, battery_level, charge_limit_soc
         FROM charges
         WHERE charging_process_id = $1
         ORDER BY date DESC
         LIMIT 1`,
        [activeProcess.id]
      );

      const detail = chargeDetail.rows[0] || {};

      return Response.json({
        charging: true,
        charging_process_id: activeProcess.id,
        start_date: activeProcess.start_date,
        charge_energy_added: activeProcess.charge_energy_added
          ? parseFloat(parseFloat(activeProcess.charge_energy_added).toFixed(2))
          : 0,
        charger_power: detail.charger_power ? parseFloat(detail.charger_power) : null,
        time_to_full_charge: detail.time_to_full_charge
          ? parseFloat(detail.time_to_full_charge)
          : null,
        battery_level: detail.battery_level ?? null,
        charge_limit_soc: detail.charge_limit_soc ?? null,
      });
    }

    // 폴백 — TeslaMate가 테이퍼/일시 정지에서 charging_processes를 닫는 경우 대비:
    // 최근 positions.power가 음수면 여전히 충전 중으로 간주
    const fallback = await pool.query(
      `SELECT p.power, p.battery_level, p.date,
              (SELECT end_date FROM charging_processes
                 WHERE car_id = $1 ORDER BY start_date DESC LIMIT 1) AS last_end,
              (SELECT start_date FROM charging_processes
                 WHERE car_id = $1 ORDER BY start_date DESC LIMIT 1) AS last_start,
              (SELECT charge_limit_soc FROM charges c
                 JOIN charging_processes cp ON cp.id = c.charging_process_id
                 WHERE cp.car_id = $1
                 ORDER BY c.date DESC LIMIT 1) AS last_limit
       FROM positions p
       WHERE p.car_id = $1
         AND p.date >= NOW() - ($2 || ' seconds')::interval
       ORDER BY p.date DESC
       LIMIT 1`,
      [carId, FALLBACK_WINDOW_SEC]
    );

    const fb = fallback.rows[0];
    if (fb && fb.power != null && parseFloat(fb.power) < FALLBACK_POWER_THRESHOLD) {
      return Response.json({
        charging: true,
        fallback: true,
        start_date: fb.last_start ?? null,
        charge_energy_added: 0,
        charger_power: Math.abs(parseFloat(fb.power)),
        time_to_full_charge: null,
        battery_level: fb.battery_level ?? null,
        charge_limit_soc: fb.last_limit ?? null,
      });
    }

    return Response.json({ charging: false });
  } catch (err) {
    console.error('/api/charging-status error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
