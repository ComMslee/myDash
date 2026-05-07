import pool from '@/lib/db';
import { KWH_PER_KM } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const carResult = await pool.query(`SELECT id FROM cars LIMIT 1`);
    if (carResult.rows.length === 0) {
      return Response.json({ error: 'No car found' }, { status: 404 });
    }
    const carId = carResult.rows[0].id;

    const [drivesResult, chargesResult, effResult, driveDaysResult, seasonalResult] = await Promise.all([
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
      pool.query(
        `SELECT
           date_trunc('month', (start_date + INTERVAL '9 hours')) AS month,
           AVG(
             (start_rated_range_km - end_rated_range_km) * $2 / NULLIF(distance, 0) * 1000
           )::float AS avg_wh_km
         FROM drives
         WHERE car_id = $1
           AND start_date >= NOW() - INTERVAL '24 months'
           AND distance > 1
           AND start_rated_range_km IS NOT NULL
           AND end_rated_range_km IS NOT NULL
         GROUP BY date_trunc('month', (start_date + INTERVAL '9 hours'))
         ORDER BY month DESC`,
        [carId, KWH_PER_KM]
      ),
      pool.query(
        `SELECT
           EXTRACT(YEAR FROM start_date + INTERVAL '9 hours')::int AS yr,
           COUNT(DISTINCT DATE(start_date + INTERVAL '9 hours'))::int AS drive_days
         FROM drives
         WHERE car_id = $1
         GROUP BY yr
         ORDER BY yr DESC`,
        [carId]
      ),
      pool.query(
        `SELECT
           CASE
             WHEN EXTRACT(MONTH FROM start_date + INTERVAL '9 hours') IN (3,4,5) THEN '봄'
             WHEN EXTRACT(MONTH FROM start_date + INTERVAL '9 hours') IN (6,7,8) THEN '여름'
             WHEN EXTRACT(MONTH FROM start_date + INTERVAL '9 hours') IN (9,10,11) THEN '가을'
             ELSE '겨울'
           END AS season,
           AVG(
             (start_rated_range_km - end_rated_range_km) * $2 / NULLIF(distance, 0) * 1000
           )::float AS wh_per_km
         FROM drives
         WHERE car_id = $1
           AND start_rated_range_km IS NOT NULL
           AND end_rated_range_km IS NOT NULL
           AND distance > 1
         GROUP BY season`,
        [carId, KWH_PER_KM]
      ),
    ]);

    const chargesByMonth = {};
    for (const row of chargesResult.rows) {
      chargesByMonth[new Date(row.month).toISOString()] = row;
    }

    const effByMonth = {};
    for (const row of effResult.rows) {
      // month is KST-truncated; key by UTC ISO string
      const d = new Date(row.month);
      // normalize to YYYY-MM key
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      effByMonth[key] = row.avg_wh_km;
    }

    const months = drivesResult.rows.map(d => {
      const date = new Date(d.month);
      const c = chargesByMonth[date.toISOString()] || {};
      const yearStr = String(date.getFullYear());
      const monthNum = date.getMonth() + 1;
      const effKey = `${yearStr}-${String(monthNum).padStart(2, '0')}`;
      const rawWh = effByMonth[effKey];
      return {
        month_label: `${yearStr.slice(2)}/${String(monthNum).padStart(2, '0')}`,
        year: date.getFullYear(),
        month: monthNum,
        drive_count: parseInt(d.drive_count),
        total_distance_km: parseFloat(parseFloat(d.total_distance).toFixed(1)),
        total_duration_min: Math.round(parseFloat(d.total_duration_min)),
        charge_count: parseInt(c.charge_count || 0),
        total_energy_kwh: parseFloat(parseFloat(c.total_energy_kwh || 0).toFixed(1)),
        avg_wh_km: rawWh != null ? parseFloat(rawWh.toFixed(1)) : null,
      };
    });

    const driveDaysByYear = {};
    for (const row of driveDaysResult.rows) {
      driveDaysByYear[row.yr] = row.drive_days;
    }

    const seasonalEff = {};
    for (const row of seasonalResult.rows) {
      if (row.wh_per_km != null) seasonalEff[row.season] = parseFloat(row.wh_per_km.toFixed(1));
    }

    return Response.json({ months, driveDaysByYear, seasonalEff });
  } catch (err) {
    console.error('/api/monthly-history error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
