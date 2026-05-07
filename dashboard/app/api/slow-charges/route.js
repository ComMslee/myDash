import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const carResult = await pool.query(`SELECT id FROM cars LIMIT 1`);
    if (carResult.rows.length === 0) return Response.json({ records: [] });
    const carId = carResult.rows[0].id;

    const result = await pool.query(
      `SELECT
         cp.id,
         cp.start_date,
         cp.end_date,
         cp.charge_energy_added,
         cp.duration_min,
         cp.start_battery_level,
         cp.end_battery_level,
         COALESCE(g.name, a.name, a.road, a.display_name) AS location,
         sub.min_power,
         sub.max_power,
         sub.avg_power
       FROM charging_processes cp
       LEFT JOIN addresses a ON a.id = cp.address_id
       LEFT JOIN geofences g ON g.id = cp.geofence_id
       JOIN (
         SELECT
           c.charging_process_id,
           MIN(c.charger_power) FILTER (WHERE c.charger_power > 0)::float AS min_power,
           MAX(c.charger_power)::float AS max_power,
           AVG(c.charger_power) FILTER (WHERE c.charger_power > 0)::float AS avg_power
         FROM charges c
         WHERE COALESCE(c.fast_charger_present, false) = false
         GROUP BY c.charging_process_id
       ) sub ON sub.charging_process_id = cp.id
       WHERE cp.car_id = $1
       ORDER BY cp.start_date DESC
       LIMIT 50`,
      [carId]
    );

    return Response.json({
      records: result.rows.map(r => ({
        id: r.id,
        start_date: r.start_date,
        end_date: r.end_date,
        energy_kwh: r.charge_energy_added ? parseFloat(parseFloat(r.charge_energy_added).toFixed(1)) : 0,
        duration_min: r.duration_min ? Math.round(parseFloat(r.duration_min)) : null,
        soc_start: r.start_battery_level ?? null,
        soc_end: r.end_battery_level ?? null,
        location: r.location || '알 수 없음',
        min_power: r.min_power ? parseFloat(r.min_power.toFixed(1)) : null,
        max_power: r.max_power ? parseFloat(r.max_power.toFixed(1)) : null,
        avg_power: r.avg_power ? parseFloat(r.avg_power.toFixed(1)) : null,
      })),
    });
  } catch (err) {
    console.error('/api/slow-charges error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
