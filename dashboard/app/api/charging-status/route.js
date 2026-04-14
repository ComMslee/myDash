import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

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

    if (activeResult.rows.length === 0) {
      return Response.json({ charging: false });
    }

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
  } catch (err) {
    console.error('/api/charging-status error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
