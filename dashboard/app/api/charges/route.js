import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const carResult = await pool.query(`SELECT id FROM cars LIMIT 1`);
    if (carResult.rows.length === 0) {
      return Response.json({ error: 'No car found' }, { status: 404 });
    }
    const carId = carResult.rows[0].id;

    const chargesResult = await pool.query(
      `SELECT id, start_date, end_date, charge_energy_added, duration_min, cost
       FROM charging_processes
       WHERE car_id = $1
       ORDER BY start_date DESC
       LIMIT 10`,
      [carId]
    );

    // Monthly cost (current month) — KST 기준 월 시작
    const now = new Date();
    const KST = 9 * 60 * 60 * 1000;
    const nowKST = new Date(now.getTime() + KST);
    const ky = nowKST.getUTCFullYear(), km = nowKST.getUTCMonth();
    const monthStart = new Date(Date.UTC(ky, km, 1) - KST);
    const monthlyCostResult = await pool.query(
      `SELECT COALESCE(SUM(cost), 0) AS total
       FROM charging_processes
       WHERE car_id = $1 AND start_date >= $2`,
      [carId, monthStart]
    );

    const allTimeCostResult = await pool.query(
      `SELECT COALESCE(SUM(cost), 0) AS total
       FROM charging_processes
       WHERE car_id = $1`,
      [carId]
    );

    return Response.json({
      history: chargesResult.rows.map(c => ({
        id: c.id,
        start_date: c.start_date,
        end_date: c.end_date,
        charge_energy_added: c.charge_energy_added
          ? parseFloat(parseFloat(c.charge_energy_added).toFixed(2))
          : 0,
        duration_min: c.duration_min ? Math.round(parseFloat(c.duration_min)) : null,
        cost: c.cost != null ? parseFloat(parseFloat(c.cost).toFixed(0)) : 0,
      })),
      monthly_cost: parseFloat(parseFloat(monthlyCostResult.rows[0].total).toFixed(0)),
      all_time_cost: parseFloat(parseFloat(allTimeCostResult.rows[0].total).toFixed(0)),
    });
  } catch (err) {
    console.error('/api/charges error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
