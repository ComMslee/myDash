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

    return Response.json(await withCache(`insights:${carId}`, 600_000, async () => {

    const now = new Date();
    // 최근 12개월 — 현재 월 포함, 11개월 전까지
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    const months12 = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months12.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }
    const earliest = months12[0];
    // 12개월 시작점 (KST 안전한 1일 00:00 timestamp string)
    const monthsFromIso = new Date(earliest.year, earliest.month - 1, 1).toISOString();

    // best_drive_* 는 "최근 4주" 윈도우
    const monthStart = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    const monthEnd = now;
    const iso = (d) => d.toISOString();

    // 이번 달 (live) — 사전 집계는 자정 기준 어제까지의 정확도, 현재 월은 라이브 단일 쿼리
    const curMonthStart = new Date(curYear, curMonth - 1, 1);
    const nextMonthStart = new Date(curYear, curMonth, 1);

    const [
      monthlyRows,
      curDriveQ, curChargeQ,
      driveHourDowQ, chargeHourDowQ,
      allTimeDriveAgg, allTimeChargeAgg,
      dayMaxResult, driveMinEffResult,
      monthBestLongResult, monthBestEffResult,
    ] = await Promise.all([
      // 11개월 (현재 월 제외) — dash_monthly_insights
      pool.query(
        `SELECT year, month,
                distance_km::float       AS distance,
                drive_count,
                duration_min,
                used_km::float           AS total_range_used,
                max_distance_km::float   AS max_distance,
                max_duration_min         AS max_duration,
                max_speed,
                total_kwh::float         AS total_kwh,
                charge_count,
                avg_kwh::float           AS avg_kwh,
                home_charges, other_charges, fast_charges, slow_charges,
                best_long_drive_id,      best_long_drive_distance::float  AS best_long_drive_distance,
                best_eff_drive_id,       best_eff_drive_distance::float   AS best_eff_drive_distance,
                best_eff_drive_wh_km::float AS best_eff_drive_wh_km
           FROM dash_monthly_insights
          WHERE car_id = $1
            AND make_date(year::int, month::int, 1) >= $2::date
            AND make_date(year::int, month::int, 1) <  make_date($3::int, $4::int, 1)
          ORDER BY year, month`,
        [carId, monthsFromIso.slice(0, 10), curYear, curMonth]
      ),
      // 현재 월 drives (live)
      pool.query(
        `SELECT
           COALESCE(SUM(distance), 0)::float AS distance,
           COUNT(*)::int AS drive_count,
           COALESCE(SUM(duration_min), 0)::int AS duration_min,
           COALESCE(MAX(distance), 0)::float AS max_distance,
           COALESCE(MAX(duration_min), 0)::int AS max_duration,
           COALESCE(MAX(speed_max), 0)::int AS max_speed,
           COALESCE(SUM(
             CASE
               WHEN start_rated_range_km IS NOT NULL AND end_rated_range_km IS NOT NULL
               THEN (start_rated_range_km - end_rated_range_km)
               ELSE 0
             END
           ), 0)::float AS total_range_used
         FROM drives
         WHERE car_id = $1 AND start_date >= $2 AND start_date < $3`,
        [carId, iso(curMonthStart), iso(nextMonthStart)]
      ),
      // 현재 월 charges (live)
      pool.query(
        `SELECT
           COALESCE(SUM(charge_energy_added), 0)::float AS total_kwh,
           COUNT(*)::int AS charge_count,
           COALESCE(AVG(charge_energy_added), 0)::float AS avg_kwh,
           COUNT(*) FILTER (WHERE geofence_id IS NOT NULL)::int AS home_charges,
           COUNT(*) FILTER (WHERE geofence_id IS NULL)::int AS other_charges,
           COUNT(*) FILTER (WHERE is_fast = true)::int AS fast_charges,
           COUNT(*) FILTER (WHERE is_fast IS DISTINCT FROM true)::int AS slow_charges
         FROM (
           SELECT cp.charge_energy_added, cp.geofence_id,
                  COALESCE(BOOL_OR(c.fast_charger_present), false) AS is_fast
           FROM charging_processes cp
           LEFT JOIN charges c ON c.charging_process_id = cp.id
           WHERE cp.car_id = $1 AND cp.start_date >= $2 AND cp.start_date < $3
             AND cp.charge_energy_added IS NOT NULL
           GROUP BY cp.id, cp.charge_energy_added, cp.geofence_id
         ) sub`,
        [carId, iso(curMonthStart), iso(nextMonthStart)]
      ),
      // 주행 (요일 × 시간) — 풀-히스토리 라이브 (여전히 빠름: ceil 패턴)
      pool.query(
        `SELECT EXTRACT(DOW  FROM hour_start)::int AS dow,
                EXTRACT(HOUR FROM hour_start)::int AS hour,
                SUM(CEIL(
                  EXTRACT(EPOCH FROM (
                    LEAST(el, hour_start + INTERVAL '1 hour')
                    - GREATEST(sl, hour_start)
                  )) / 600.0
                ))::int AS count
         FROM (
           SELECT start_date + INTERVAL '9 hours' AS sl,
                  COALESCE(end_date, start_date) + INTERVAL '9 hours' AS el
           FROM drives WHERE car_id = $1
         ) d
         CROSS JOIN LATERAL generate_series(
           date_trunc('hour', sl),
           date_trunc('hour', el),
           INTERVAL '1 hour'
         ) AS hour_start
         WHERE LEAST(el, hour_start + INTERVAL '1 hour') > GREATEST(sl, hour_start)
         GROUP BY dow, hour`,
        [carId]
      ),
      pool.query(
        `SELECT EXTRACT(DOW  FROM hour_start)::int AS dow,
                EXTRACT(HOUR FROM hour_start)::int AS hour,
                SUM(CEIL(
                  EXTRACT(EPOCH FROM (
                    LEAST(el, hour_start + INTERVAL '1 hour')
                    - GREATEST(sl, hour_start)
                  )) / 600.0
                ))::int AS count
         FROM (
           SELECT start_date + INTERVAL '9 hours' AS sl,
                  COALESCE(end_date, start_date) + INTERVAL '9 hours' AS el
           FROM charging_processes
           WHERE car_id = $1 AND charge_energy_added IS NOT NULL
         ) c
         CROSS JOIN LATERAL generate_series(
           date_trunc('hour', sl),
           date_trunc('hour', el),
           INTERVAL '1 hour'
         ) AS hour_start
         WHERE LEAST(el, hour_start + INTERVAL '1 hour') > GREATEST(sl, hour_start)
         GROUP BY dow, hour`,
        [carId]
      ),
      // 전체 기간 = 사전 집계 SUM (현재 월은 live 로 추가 머지)
      pool.query(
        `SELECT
           COALESCE(SUM(distance_km), 0)::float     AS distance,
           COALESCE(SUM(drive_count), 0)::int       AS drive_count,
           COALESCE(SUM(duration_min), 0)::int      AS duration_min,
           COALESCE(MAX(max_distance_km), 0)::float AS max_distance,
           COALESCE(MAX(max_duration_min), 0)::int  AS max_duration,
           COALESCE(MAX(max_speed), 0)::int         AS max_speed,
           COALESCE(SUM(used_km), 0)::float         AS total_range_used
         FROM dash_monthly_insights
         WHERE car_id = $1
           AND make_date(year::int, month::int, 1) < make_date($2::int, $3::int, 1)`,
        [carId, curYear, curMonth]
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(total_kwh), 0)::float    AS total_kwh,
           COALESCE(SUM(charge_count), 0)::int   AS charge_count,
           COALESCE(SUM(home_charges), 0)::int   AS home_charges,
           COALESCE(SUM(other_charges), 0)::int  AS other_charges,
           COALESCE(SUM(fast_charges), 0)::int   AS fast_charges,
           COALESCE(SUM(slow_charges), 0)::int   AS slow_charges
         FROM dash_monthly_insights
         WHERE car_id = $1
           AND make_date(year::int, month::int, 1) < make_date($2::int, $3::int, 1)`,
        [carId, curYear, curMonth]
      ),
      // 전체 기간 일별 최대 거리/시간 + 최저 효율 — drives 풀스캔 (라이브)
      pool.query(
        `SELECT MAX(day_distance)::float AS max_day_distance,
                MAX(day_duration)::int AS max_day_duration,
                MAX(day_avg_speed)::float AS max_day_avg_speed,
                MIN(day_eff)::float AS min_day_eff_wh_km
         FROM (
           SELECT DATE(start_date + INTERVAL '9 hours')::text AS day,
                  SUM(distance)::float AS day_distance,
                  SUM(duration_min)::int AS day_duration,
                  CASE WHEN SUM(distance) >= 10 AND SUM(duration_min) > 0
                       THEN SUM(distance) / SUM(duration_min) * 60
                       ELSE NULL
                  END AS day_avg_speed,
                  CASE WHEN SUM(distance) >= 10
                            AND SUM(CASE WHEN start_rated_range_km IS NOT NULL AND end_rated_range_km IS NOT NULL
                                         THEN (start_rated_range_km - end_rated_range_km) ELSE 0 END) > 0
                       THEN SUM(CASE WHEN start_rated_range_km IS NOT NULL AND end_rated_range_km IS NOT NULL
                                     THEN (start_rated_range_km - end_rated_range_km) ELSE 0 END)
                            * ${KWH_PER_KM} / SUM(distance) * 1000
                       ELSE NULL
                  END AS day_eff
           FROM drives
           WHERE car_id = $1
           GROUP BY day
         ) sub`,
        [carId]
      ),
      pool.query(
        `SELECT MIN(
           (start_rated_range_km - end_rated_range_km) * ${KWH_PER_KM} / NULLIF(distance, 0) * 1000
         )::float AS min_eff_wh_km
         FROM drives
         WHERE car_id = $1
           AND distance >= 10
           AND start_rated_range_km IS NOT NULL
           AND end_rated_range_km IS NOT NULL
           AND (start_rated_range_km - end_rated_range_km) > 0`,
        [carId]
      ),
      // 최근 4주 best long/eff — 라이브 (정확도/단순성)
      pool.query(
        `SELECT id, start_date, distance::float AS distance
         FROM drives
         WHERE car_id = $1 AND start_date >= $2 AND start_date < $3
           AND distance IS NOT NULL
         ORDER BY distance DESC NULLS LAST
         LIMIT 1`,
        [carId, iso(monthStart), iso(monthEnd)]
      ),
      pool.query(
        `SELECT id, start_date, distance::float AS distance,
                ((start_rated_range_km - end_rated_range_km) * ${KWH_PER_KM} / NULLIF(distance, 0) * 1000)::float AS eff_wh_km
         FROM drives
         WHERE car_id = $1 AND start_date >= $2 AND start_date < $3
           AND distance >= 10
           AND start_rated_range_km IS NOT NULL
           AND end_rated_range_km IS NOT NULL
           AND (start_rated_range_km - end_rated_range_km) > 0
         ORDER BY ((start_rated_range_km - end_rated_range_km) * ${KWH_PER_KM} / NULLIF(distance, 0) * 1000) ASC
         LIMIT 1`,
        [carId, iso(monthStart), iso(monthEnd)]
      ),
    ]);

    // 사전 집계 → Map<year-month, row>
    const monthlyByKey = new Map();
    for (const r of monthlyRows.rows) {
      monthlyByKey.set(`${r.year}-${r.month}`, r);
    }
    // 현재 월 live
    const cd = curDriveQ.rows[0];
    const cc = curChargeQ.rows[0];
    const curRow = {
      year: curYear, month: curMonth,
      distance: cd.distance, drive_count: cd.drive_count, duration_min: cd.duration_min,
      max_distance: cd.max_distance, max_duration: cd.max_duration, max_speed: cd.max_speed,
      total_range_used: cd.total_range_used,
      total_kwh: cc.total_kwh, charge_count: cc.charge_count, avg_kwh: cc.avg_kwh,
      home_charges: cc.home_charges, other_charges: cc.other_charges,
      fast_charges: cc.fast_charges, slow_charges: cc.slow_charges,
    };

    // 12개월 breakdown — 사전집계 + 현재 월 live
    const twelveMonthBreakdown = months12.map(({ year, month }) => {
      if (year === curYear && month === curMonth) return curRow;
      const r = monthlyByKey.get(`${year}-${month}`);
      if (!r) {
        return {
          year, month,
          distance: 0, drive_count: 0, duration_min: 0,
          max_distance: 0, max_duration: 0, max_speed: 0,
          total_range_used: 0,
          total_kwh: 0, charge_count: 0, avg_kwh: 0,
          home_charges: 0, other_charges: 0, fast_charges: 0, slow_charges: 0,
        };
      }
      return {
        year, month,
        distance: r.distance, drive_count: r.drive_count, duration_min: r.duration_min,
        max_distance: r.max_distance, max_duration: r.max_duration, max_speed: r.max_speed,
        total_range_used: r.total_range_used,
        total_kwh: r.total_kwh, charge_count: r.charge_count, avg_kwh: r.avg_kwh,
        home_charges: r.home_charges, other_charges: r.other_charges,
        fast_charges: r.fast_charges, slow_charges: r.slow_charges,
      };
    });

    const current = twelveMonthBreakdown[11];
    const previous = twelveMonthBreakdown[10];

    const effCur = current.distance > 0 ? (current.total_range_used * KWH_PER_KM / current.distance * 1000) : 0;
    const effPrev = previous.distance > 0 ? (previous.total_range_used * KWH_PER_KM / previous.distance * 1000) : 0;

    const aggregate = (months) => {
      const agg = {
        distance: months.reduce((s, m) => s + m.distance, 0),
        drive_count: months.reduce((s, m) => s + m.drive_count, 0),
        duration_min: months.reduce((s, m) => s + m.duration_min, 0),
        total_kwh: months.reduce((s, m) => s + m.total_kwh, 0),
        charge_count: months.reduce((s, m) => s + m.charge_count, 0),
        home_charges: months.reduce((s, m) => s + m.home_charges, 0),
        other_charges: months.reduce((s, m) => s + m.other_charges, 0),
        fast_charges: months.reduce((s, m) => s + (m.fast_charges || 0), 0),
        slow_charges: months.reduce((s, m) => s + (m.slow_charges || 0), 0),
        total_range_used: months.reduce((s, m) => s + m.total_range_used, 0),
        max_distance: Math.max(0, ...months.map(m => m.max_distance)),
        max_duration: Math.max(0, ...months.map(m => m.max_duration)),
        max_speed: Math.max(0, ...months.map(m => m.max_speed)),
      };
      const avg_speed = agg.duration_min > 0 ? parseFloat((agg.distance / Math.max(1, agg.duration_min) * 60).toFixed(1)) : 0;
      const eff = agg.distance > 0 ? (agg.total_range_used * KWH_PER_KM / agg.distance * 1000) : 0;
      return {
        distance: parseFloat(agg.distance.toFixed(1)),
        drive_count: agg.drive_count,
        duration_min: agg.duration_min,
        total_kwh: parseFloat(agg.total_kwh.toFixed(1)),
        charge_count: agg.charge_count,
        avg_kwh: agg.charge_count > 0 ? parseFloat((agg.total_kwh / agg.charge_count).toFixed(1)) : 0,
        home_charges: agg.home_charges,
        other_charges: agg.other_charges,
        fast_charges: agg.fast_charges,
        slow_charges: agg.slow_charges,
        max_distance: parseFloat(agg.max_distance.toFixed(1)),
        max_duration: agg.max_duration,
        max_speed: agg.max_speed,
        avg_speed,
        efficiency_wh_km: parseFloat(eff.toFixed(0)),
      };
    };

    // 전체 기간 = 사전집계(과거 11개월+이전) + 현재 월 live
    const atd = allTimeDriveAgg.rows[0];
    const atc = allTimeChargeAgg.rows[0];
    const allTimeDistance = atd.distance + curRow.distance;
    const allTimeDriveCount = atd.drive_count + curRow.drive_count;
    const allTimeDuration = atd.duration_min + curRow.duration_min;
    const allTimeRangeUsed = atd.total_range_used + curRow.total_range_used;
    const allTimeMaxDistance = Math.max(atd.max_distance, curRow.max_distance);
    const allTimeMaxDuration = Math.max(atd.max_duration, curRow.max_duration);
    const allTimeMaxSpeed = Math.max(atd.max_speed, curRow.max_speed);
    const allTimeTotalKwh = atc.total_kwh + curRow.total_kwh;
    const allTimeChargeCount = atc.charge_count + curRow.charge_count;
    const allTimeHome = atc.home_charges + curRow.home_charges;
    const allTimeOther = atc.other_charges + curRow.other_charges;
    const allTimeFast = atc.fast_charges + curRow.fast_charges;
    const allTimeSlow = atc.slow_charges + curRow.slow_charges;

    const dayMax = dayMaxResult.rows[0] || {};
    const allTimeAvgSpeed = allTimeDuration > 0 ? parseFloat((allTimeDistance / Math.max(1, allTimeDuration) * 60).toFixed(1)) : 0;
    const allTimeEff = allTimeDistance > 0 ? (allTimeRangeUsed * KWH_PER_KM / allTimeDistance * 1000) : 0;

    const allTime = {
      distance: parseFloat(allTimeDistance.toFixed(1)),
      drive_count: allTimeDriveCount,
      duration_min: allTimeDuration,
      total_kwh: parseFloat(allTimeTotalKwh.toFixed(1)),
      charge_count: allTimeChargeCount,
      avg_kwh: allTimeChargeCount > 0 ? parseFloat((allTimeTotalKwh / allTimeChargeCount).toFixed(1)) : 0,
      home_charges: allTimeHome,
      other_charges: allTimeOther,
      fast_charges: allTimeFast,
      slow_charges: allTimeSlow,
      max_distance: parseFloat(allTimeMaxDistance.toFixed(1)),
      max_duration: allTimeMaxDuration,
      max_speed: allTimeMaxSpeed,
      avg_speed: allTimeAvgSpeed,
      efficiency_wh_km: parseFloat(allTimeEff.toFixed(0)),
      max_day_distance: dayMax.max_day_distance != null ? parseFloat(parseFloat(dayMax.max_day_distance).toFixed(1)) : 0,
      max_day_duration: dayMax.max_day_duration != null ? parseInt(dayMax.max_day_duration) : 0,
      max_day_avg_speed: dayMax.max_day_avg_speed != null ? parseFloat(parseFloat(dayMax.max_day_avg_speed).toFixed(1)) : null,
      min_eff_wh_km: driveMinEffResult.rows[0]?.min_eff_wh_km != null
        ? Math.round(parseFloat(driveMinEffResult.rows[0].min_eff_wh_km))
        : null,
      min_day_eff_wh_km: dayMax.min_day_eff_wh_km != null
        ? Math.round(parseFloat(dayMax.min_day_eff_wh_km))
        : null,
    };

    const bestLongRow = monthBestLongResult.rows[0];
    const bestEffRow = monthBestEffResult.rows[0];

    const driveGrid = Array.from({ length: 7 }, () => Array(24).fill(0));
    const chargeGrid = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const r of driveHourDowQ.rows)  driveGrid[r.dow][r.hour]  = r.count;
    for (const r of chargeHourDowQ.rows) chargeGrid[r.dow][r.hour] = r.count;

    return {
      current: {
        distance: parseFloat(current.distance.toFixed(1)),
        drive_count: current.drive_count,
        duration_min: current.duration_min,
        total_kwh: parseFloat(current.total_kwh.toFixed(1)),
        charge_count: current.charge_count,
        avg_kwh: parseFloat(current.avg_kwh.toFixed(1)),
        home_charges: current.home_charges,
        other_charges: current.other_charges,
        max_distance: parseFloat(current.max_distance.toFixed(1)),
        max_duration: current.max_duration,
        max_speed: current.max_speed,
        efficiency_wh_km: parseFloat(effCur.toFixed(0)),
        best_drive_long: bestLongRow ? {
          id: bestLongRow.id,
          start_date: bestLongRow.start_date,
          distance: parseFloat(parseFloat(bestLongRow.distance).toFixed(1)),
        } : null,
        best_drive_eff: bestEffRow ? {
          id: bestEffRow.id,
          start_date: bestEffRow.start_date,
          distance: parseFloat(parseFloat(bestEffRow.distance).toFixed(1)),
          eff_wh_km: Math.round(parseFloat(bestEffRow.eff_wh_km)),
        } : null,
      },
      previous: {
        distance: parseFloat(previous.distance.toFixed(1)),
        drive_count: previous.drive_count,
        total_kwh: parseFloat(previous.total_kwh.toFixed(1)),
        charge_count: previous.charge_count,
        efficiency_wh_km: parseFloat(effPrev.toFixed(0)),
      },
      threeMonth: aggregate(twelveMonthBreakdown.slice(9)),
      sixMonth:   aggregate(twelveMonthBreakdown.slice(6)),
      twelveMonth: aggregate(twelveMonthBreakdown),
      allTime,
      monthlyBreakdown: twelveMonthBreakdown.map(m => ({
        year: m.year,
        month: m.month,
        distance: parseFloat(m.distance.toFixed(1)),
        drive_count: m.drive_count,
        total_kwh: parseFloat(m.total_kwh.toFixed(1)),
        charge_count: m.charge_count,
      })),
      hour_dow: driveGrid,
      charge_hour_dow: chargeGrid,
    };
    }, { force }));
  } catch (err) {
    console.error('/api/insights error:', err);
    return Response.json({ error: 'DB error' }, { status: 500 });
  }
}
