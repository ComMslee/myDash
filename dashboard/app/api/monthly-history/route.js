import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const carResult = await pool.query(`SELECT id FROM cars LIMIT 1`);
    if (carResult.rows.length === 0) {
      return Response.json({ error: 'No car found' }, { status: 404 });
    }
    const carId = carResult.rows[0].id;

    const [drivesResult, chargesResult] = await Promise.all([
      pool.query(
        `SELECT
           date_trunc('month', start_date) AS month,
           COUNT(*) AS drive_count,
           COALESCE(SUM(distance), 0) AS total_distance,
           COALESCE(SUM(duration_min), 0) AS total_duration_min
         FROM drives
         WHERE car_id = $1 AND start_date >= NOW() - INTERVAL '24 months'
         GROUP BY month
         ORDER BY month DESC`,
        [carId]
      ),
      pool.query(
        `SELECT
           date_trunc('month', start_date) AS month,
           COUNT(*) AS charge_count,
           COALESCE(SUM(charge_energy_added), 0) AS total_energy_kwh
         FROM charging_processes
         WHERE car_id = $1 AND start_date >= NOW() - INTERVAL '24 months'
         GROUP BY month
         ORDER BY month DESC`,
        [carId]
      ),
    ]);

    const chargesByMonth = {};
    for (const row of chargesResult.rows) {
      chargesByMonth[new Date(row.month).toISOString()] = row;
    }

    const months = drivesResult.rows.map(d => {
      const date = new Date(d.month);
      const c = chargesByMonth[date.toISOString()] || {};
      return {
        month_label: `${String(date.getFullYear()).slice(2)}/${String(date.getMonth() + 1).padStart(2, '0')}`,
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        drive_count: parseInt(d.drive_count),
        total_distance_km: parseFloat(parseFloat(d.total_distance).toFixed(1)),
        total_duration_min: Math.round(parseFloat(d.total_duration_min)),
        charge_count: parseInt(c.charge_count || 0),
        total_energy_kwh: parseFloat(parseFloat(c.total_energy_kwh || 0).toFixed(1)),
      };
    });

    return Response.json({ months });
  } catch (err) {
    console.error('/api/monthly-history error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
