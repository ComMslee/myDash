import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

// 365일 GitHub 스타일 히트맵용 일별 집계
// 응답: { days: { 'YYYY-MM-DD': { km, kwh, drives, charges } }, max_km, max_kwh }
export async function GET() {
  try {
    const carResult = await pool.query(`SELECT id FROM cars LIMIT 1`);
    if (carResult.rows.length === 0) {
      return Response.json({ error: 'No car found' }, { status: 404 });
    }
    const carId = carResult.rows[0].id;

    const [drivesResult, chargesResult] = await Promise.all([
      // 주행: KST(UTC+9) 기준 일별 합계
      pool.query(
        `SELECT TO_CHAR((start_date + INTERVAL '9 hours')::date, 'YYYY-MM-DD') AS day,
                COALESCE(SUM(distance), 0)::float AS km,
                COUNT(*)::int AS drives
         FROM drives
         WHERE car_id = $1
           AND start_date >= NOW() - INTERVAL '365 days'
         GROUP BY day`,
        [carId]
      ),
      // 충전: KST 기준 일별 합계
      pool.query(
        `SELECT TO_CHAR((start_date + INTERVAL '9 hours')::date, 'YYYY-MM-DD') AS day,
                COALESCE(SUM(charge_energy_added), 0)::float AS kwh,
                COUNT(*)::int AS charges
         FROM charging_processes
         WHERE car_id = $1
           AND start_date >= NOW() - INTERVAL '365 days'
           AND charge_energy_added IS NOT NULL
         GROUP BY day`,
        [carId]
      ),
    ]);

    const days = {};
    let maxKm = 0;
    let maxKwh = 0;

    for (const r of drivesResult.rows) {
      const km = parseFloat(r.km.toFixed(1));
      days[r.day] = { km, kwh: 0, drives: r.drives, charges: 0 };
      if (km > maxKm) maxKm = km;
    }
    for (const r of chargesResult.rows) {
      const kwh = parseFloat(r.kwh.toFixed(1));
      if (!days[r.day]) days[r.day] = { km: 0, kwh: 0, drives: 0, charges: 0 };
      days[r.day].kwh = kwh;
      days[r.day].charges = r.charges;
      if (kwh > maxKwh) maxKwh = kwh;
    }

    return Response.json({ days, max_km: maxKm, max_kwh: maxKwh });
  } catch (err) {
    console.error('/api/year-heatmap error:', err);
    return Response.json({ error: 'DB error' }, { status: 500 });
  }
}
