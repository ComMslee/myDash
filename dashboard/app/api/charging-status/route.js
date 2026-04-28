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

      // Get latest charge detail — TeslaMate charges 테이블에 charge_limit_soc 컬럼이
      // 없는 스키마가 있어 SELECT 에서 제외. 응답에서는 null 로 반환.
      const chargeDetail = await pool.query(
        `SELECT charger_power, time_to_full_charge, battery_level
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
        charge_limit_soc: null,
      });
    }

    // 폴백 — TeslaMate가 charging_processes를 닫아버리거나 아예 안 여는 케이스 대비.
    // 두 신호 OR로 판정: (a) 최근 positions.power < 0, (b) 최근 배터리 레벨 증가
    const fallback = await pool.query(
      `SELECT
         (SELECT power FROM positions
            WHERE car_id = $1 ORDER BY date DESC LIMIT 1) AS latest_power,
         (SELECT battery_level FROM positions
            WHERE car_id = $1 AND date >= NOW() - ($2 || ' seconds')::interval
            ORDER BY date DESC LIMIT 1) AS recent_level,
         (SELECT battery_level FROM positions
            WHERE car_id = $1 AND date <= NOW() - ($3 || ' seconds')::interval
              AND date >= NOW() - ($4 || ' seconds')::interval
            ORDER BY date DESC LIMIT 1) AS older_level,
         (SELECT date FROM positions
            WHERE car_id = $1 ORDER BY date DESC LIMIT 1) AS latest_date,
         (SELECT start_date FROM charging_processes
            WHERE car_id = $1 ORDER BY start_date DESC LIMIT 1) AS last_start`,
      [carId, FALLBACK_WINDOW_SEC, 300, 1200] // 최근 3분 / 5~20분 전
    );

    const fb = fallback.rows[0] || {};
    const powerSignal = fb.latest_power != null
      && parseFloat(fb.latest_power) < FALLBACK_POWER_THRESHOLD;
    const levelSignal = fb.recent_level != null
      && fb.older_level != null
      && fb.recent_level > fb.older_level;

    const debug = {
      latest_power: fb.latest_power != null ? parseFloat(fb.latest_power) : null,
      recent_level: fb.recent_level ?? null,
      older_level: fb.older_level ?? null,
      latest_date: fb.latest_date ?? null,
      power_signal: powerSignal,
      level_signal: levelSignal,
    };

    if (powerSignal || levelSignal) {
      const inferredPower = fb.latest_power != null && parseFloat(fb.latest_power) < 0
        ? Math.abs(parseFloat(fb.latest_power))
        : null;
      return Response.json({
        charging: true,
        fallback: true,
        fallback_reason: powerSignal && levelSignal ? 'power+level'
          : powerSignal ? 'power' : 'level',
        start_date: fb.last_start ?? null,
        charge_energy_added: 0,
        charger_power: inferredPower,
        time_to_full_charge: null,
        battery_level: fb.recent_level ?? null,
        charge_limit_soc: null,
        debug,
      });
    }

    return Response.json({ charging: false, debug });
  } catch (err) {
    console.error('/api/charging-status error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
