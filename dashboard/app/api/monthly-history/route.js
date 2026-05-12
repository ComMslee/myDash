import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';
import { KWH_PER_KM } from '@/lib/constants';
import { withCache } from '@/lib/server-cache';
import { ensureSchema, bootstrapIfEmpty } from '@/lib/dash-agg';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const force = new URL(request.url).searchParams.get('refresh') === '1';
  try {
    const car = await getDefaultCar();
    if (!car) {
      return Response.json({ error: 'No car found' }, { status: 404 });
    }
    const carId = car.id;

    await ensureSchema();
    await bootstrapIfEmpty(carId);

    return Response.json(await withCache(`monthly-history:${carId}`, 300_000, async () => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    const curMonthStart = new Date(curYear, curMonth - 1, 1);
    const nextMonthStart = new Date(curYear, curMonth, 1);

    const [monthlyRows, driveDaysResult, curDrive, curCharge, curEff] = await Promise.all([
      // 모든 월 (과거) — 현재 월 제외
      pool.query(
        `SELECT year, month,
                distance_km::float AS total_distance_km,
                drive_count,
                duration_min        AS total_duration_min,
                used_km::float      AS used_km,
                total_kwh::float    AS total_energy_kwh,
                charge_count
           FROM dash_monthly_insights
          WHERE car_id = $1
            AND make_date(year::int, month::int, 1) < make_date($2::int, $3::int, 1)
          ORDER BY year DESC, month DESC`,
        [carId, curYear, curMonth]
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
      // 현재 월 drives (live) — 효율 계산용 distance/used_km/duration_min 도 함께
      pool.query(
        `SELECT
           COALESCE(SUM(distance), 0)::float       AS total_distance_km,
           COUNT(*)::int                            AS drive_count,
           COALESCE(SUM(duration_min), 0)::int      AS total_duration_min,
           COALESCE(SUM(CASE WHEN start_rated_range_km IS NOT NULL AND end_rated_range_km IS NOT NULL
                              AND (start_rated_range_km - end_rated_range_km) > 0
                             THEN (start_rated_range_km - end_rated_range_km) ELSE 0 END), 0)::float AS used_km
         FROM drives
         WHERE car_id = $1 AND start_date >= $2 AND start_date < $3`,
        [carId, curMonthStart.toISOString(), nextMonthStart.toISOString()]
      ),
      // 현재 월 charges (live)
      pool.query(
        `SELECT
           COUNT(*)::int                              AS charge_count,
           COALESCE(SUM(charge_energy_added), 0)::float AS total_energy_kwh
         FROM charging_processes
         WHERE car_id = $1 AND start_date >= $2 AND start_date < $3
           AND charge_energy_added IS NOT NULL`,
        [carId, curMonthStart.toISOString(), nextMonthStart.toISOString()]
      ),
      // 현재 월 평균 효율 — distance > 1, range 유효
      pool.query(
        `SELECT AVG(
           (start_rated_range_km - end_rated_range_km) * $4 / NULLIF(distance, 0) * 1000
         )::float AS avg_wh_km
         FROM drives
         WHERE car_id = $1 AND start_date >= $2 AND start_date < $3
           AND distance > 1
           AND start_rated_range_km IS NOT NULL
           AND end_rated_range_km IS NOT NULL`,
        [carId, curMonthStart.toISOString(), nextMonthStart.toISOString(), KWH_PER_KM]
      ),
    ]);

    // 월별 효율 계산: used_km*KWH_PER_KM/distance*1000 — 사전집계 used_km 기반
    const buildMonth = (year, month, dist, dur, cnt, kwh, chargeCnt, used) => {
      const distF = parseFloat(dist) || 0;
      const usedF = parseFloat(used) || 0;
      const avgWh = (distF > 1 && usedF > 0)
        ? (usedF * KWH_PER_KM / distF * 1000)
        : null;
      return {
        month_label: `${String(year).slice(2)}/${String(month).padStart(2, '0')}`,
        year,
        month,
        drive_count: parseInt(cnt) || 0,
        total_distance_km: parseFloat(distF.toFixed(1)),
        total_duration_min: Math.round(parseFloat(dur) || 0),
        charge_count: parseInt(chargeCnt) || 0,
        total_energy_kwh: parseFloat((parseFloat(kwh) || 0).toFixed(1)),
        avg_wh_km: avgWh != null ? parseFloat(avgWh.toFixed(1)) : null,
      };
    };

    // 현재 월 (live) 가 가장 앞 (최신)
    const cd = curDrive.rows[0];
    const cc = curCharge.rows[0];
    const ceRow = curEff.rows[0] || {};
    const curWh = ceRow.avg_wh_km != null ? parseFloat(parseFloat(ceRow.avg_wh_km).toFixed(1)) : null;
    const curMonthEntry = {
      month_label: `${String(curYear).slice(2)}/${String(curMonth).padStart(2, '0')}`,
      year: curYear,
      month: curMonth,
      drive_count: cd.drive_count,
      total_distance_km: parseFloat(parseFloat(cd.total_distance_km).toFixed(1)),
      total_duration_min: cd.total_duration_min,
      charge_count: cc.charge_count,
      total_energy_kwh: parseFloat(parseFloat(cc.total_energy_kwh).toFixed(1)),
      avg_wh_km: curWh,
    };

    const pastMonths = monthlyRows.rows.map(r =>
      buildMonth(r.year, r.month, r.total_distance_km, r.total_duration_min, r.drive_count,
                 r.total_energy_kwh, r.charge_count, r.used_km)
    );
    const months = [curMonthEntry, ...pastMonths];

    const driveDaysByYear = {};
    for (const row of driveDaysResult.rows) {
      driveDaysByYear[row.yr] = row.drive_days;
    }

    // 계절별 효율 — 사전 집계의 month 로 계절 분류 + 현재 월 라이브
    const seasonOf = (m) => (
      (m >= 3 && m <= 5) ? '봄'
      : (m >= 6 && m <= 8) ? '여름'
      : (m >= 9 && m <= 11) ? '가을'
      : '겨울'
    );
    const seasonAcc = { 봄: { d: 0, u: 0 }, 여름: { d: 0, u: 0 }, 가을: { d: 0, u: 0 }, 겨울: { d: 0, u: 0 } };
    for (const r of monthlyRows.rows) {
      const s = seasonOf(r.month);
      const d = parseFloat(r.total_distance_km) || 0;
      const u = parseFloat(r.used_km) || 0;
      if (d > 1 && u > 0) {
        seasonAcc[s].d += d;
        seasonAcc[s].u += u;
      }
    }
    // 현재 월 추가
    const cD = parseFloat(cd.total_distance_km) || 0;
    const cU = parseFloat(cd.used_km) || 0;
    if (cD > 1 && cU > 0) {
      const s = seasonOf(curMonth);
      seasonAcc[s].d += cD;
      seasonAcc[s].u += cU;
    }
    const seasonalEff = {};
    for (const [s, v] of Object.entries(seasonAcc)) {
      if (v.d > 0 && v.u > 0) {
        seasonalEff[s] = parseFloat((v.u * KWH_PER_KM / v.d * 1000).toFixed(1));
      }
    }

    return { months, driveDaysByYear, seasonalEff };
    }, { force }));
  } catch (err) {
    console.error('/api/monthly-history error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
