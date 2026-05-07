import pool from '@/lib/db';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const carResult = await pool.query(`SELECT id FROM cars LIMIT 1`);
    if (!carResult.rows.length) return Response.json({ error: 'No car' }, { status: 404 });
    const carId = carResult.rows[0].id;

    // 월별 추정 배터리 용량 (충전 세션 역산)
    const capacityResult = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', start_date + INTERVAL '9 hours'), 'YYYY-MM') AS month,
        AVG(charge_energy_added / NULLIF(end_battery_level - start_battery_level, 0) * 100)::float AS est_capacity_kwh,
        COUNT(*)::int AS sample_count
      FROM charging_processes
      WHERE car_id = $1
        AND charge_energy_added > 5
        AND start_battery_level IS NOT NULL
        AND end_battery_level IS NOT NULL
        AND end_battery_level > start_battery_level + 5
      GROUP BY month
      ORDER BY month
    `, [carId]);

    // 월별 평균 충전 시작/종료 레벨
    const habitResult = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', start_date + INTERVAL '9 hours'), 'YYYY-MM') AS month,
        AVG(start_battery_level)::float AS avg_start,
        AVG(end_battery_level)::float AS avg_end,
        COUNT(*)::int AS charge_count
      FROM charging_processes
      WHERE car_id = $1
        AND start_battery_level IS NOT NULL
        AND end_battery_level IS NOT NULL
        AND charge_energy_added IS NOT NULL
      GROUP BY month
      ORDER BY month
    `, [carId]);

    return Response.json({
      capacity_trend: capacityResult.rows.map(r => ({
        month: r.month,
        est_capacity_kwh: parseFloat(Number(r.est_capacity_kwh).toFixed(1)),
        sample_count: r.sample_count,
      })),
      habit_trend: habitResult.rows.map(r => ({
        month: r.month,
        avg_start: parseFloat(Number(r.avg_start).toFixed(1)),
        avg_end: parseFloat(Number(r.avg_end).toFixed(1)),
        charge_count: r.charge_count,
      })),
    });
  } catch (err) {
    console.error('/api/battery-trend error:', err);
    return Response.json({ error: 'DB error' }, { status: 500 });
  }
}
