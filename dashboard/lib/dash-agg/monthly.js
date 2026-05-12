import pool from '@/lib/db';
import { KWH_PER_KM } from '@/lib/constants';
import { withTxn } from './_txn';

// refreshMonthlyInsights — 월별 주행/충전 + 베스트 long/eff drive upsert.
// drives / charges 둘 다 없는 달은 행 자체 없음.
//
// @param fromDate  YYYY-MM-DD (KST, 시작 포함)
// @param toDate    YYYY-MM-DD (KST, 끝 제외)
// @param maxMonths 안전 상한 (기본 36)
export async function refreshMonthlyInsights(carId, fromDate, toDate, maxMonths = 36) {
  const t0 = Date.now();
  const driveAgg = await pool.query(
    `WITH months AS (
       SELECT
         EXTRACT(YEAR  FROM start_date + INTERVAL '9 hours')::int AS yr,
         EXTRACT(MONTH FROM start_date + INTERVAL '9 hours')::int AS mo,
         COALESCE(SUM(distance), 0)::real    AS distance_km,
         COUNT(*)::int                       AS drive_count,
         COALESCE(SUM(duration_min), 0)::int AS duration_min,
         COALESCE(SUM(CASE WHEN start_rated_range_km IS NOT NULL AND end_rated_range_km IS NOT NULL
                           AND (start_rated_range_km - end_rated_range_km) > 0
                          THEN (start_rated_range_km - end_rated_range_km) ELSE 0 END), 0)::real AS used_km,
         COALESCE(MAX(distance), 0)::real    AS max_distance_km,
         COALESCE(MAX(duration_min), 0)::int AS max_duration_min,
         COALESCE(MAX(speed_max), 0)::int    AS max_speed
       FROM drives
       WHERE car_id = $1
         AND start_date + INTERVAL '9 hours' >= $2::timestamp
         AND start_date + INTERVAL '9 hours' <  $3::timestamp
       GROUP BY 1, 2
     )
     SELECT * FROM months ORDER BY yr DESC, mo DESC LIMIT $4`,
    [carId, fromDate, toDate, maxMonths]
  );

  const chargeAgg = await pool.query(
    `SELECT
       EXTRACT(YEAR  FROM cp.start_date + INTERVAL '9 hours')::int AS yr,
       EXTRACT(MONTH FROM cp.start_date + INTERVAL '9 hours')::int AS mo,
       COALESCE(SUM(cp.charge_energy_added), 0)::real                                   AS total_kwh,
       COUNT(*)::int                                                                    AS charge_count,
       COALESCE(AVG(cp.charge_energy_added), 0)::real                                   AS avg_kwh,
       COUNT(*) FILTER (WHERE cp.geofence_id IS NOT NULL)::int                          AS home_charges,
       COUNT(*) FILTER (WHERE cp.geofence_id IS NULL)::int                              AS other_charges,
       COUNT(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM charges ch
          WHERE ch.charging_process_id = cp.id
            AND ch.fast_charger_present = true
       ))::int                                                                          AS fast_charges,
       COUNT(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM charges ch
          WHERE ch.charging_process_id = cp.id
            AND ch.fast_charger_present = true
       ))::int                                                                          AS slow_charges
     FROM charging_processes cp
     WHERE cp.car_id = $1
       AND cp.charge_energy_added IS NOT NULL
       AND cp.start_date + INTERVAL '9 hours' >= $2::timestamp
       AND cp.start_date + INTERVAL '9 hours' <  $3::timestamp
     GROUP BY 1, 2`,
    [carId, fromDate, toDate]
  );

  const bestLong = await pool.query(
    `SELECT DISTINCT ON (yr, mo)
            EXTRACT(YEAR  FROM start_date + INTERVAL '9 hours')::int AS yr,
            EXTRACT(MONTH FROM start_date + INTERVAL '9 hours')::int AS mo,
            id, distance::real AS distance
       FROM drives
      WHERE car_id = $1
        AND start_date + INTERVAL '9 hours' >= $2::timestamp
        AND start_date + INTERVAL '9 hours' <  $3::timestamp
        AND distance IS NOT NULL
      ORDER BY yr, mo, distance DESC NULLS LAST`,
    [carId, fromDate, toDate]
  );

  // distance >= 10, used > 0, 최저 wh/km
  const bestEff = await pool.query(
    `SELECT DISTINCT ON (yr, mo)
            EXTRACT(YEAR  FROM start_date + INTERVAL '9 hours')::int AS yr,
            EXTRACT(MONTH FROM start_date + INTERVAL '9 hours')::int AS mo,
            id, distance::real AS distance,
            ((start_rated_range_km - end_rated_range_km) * ${KWH_PER_KM} / NULLIF(distance, 0) * 1000)::real AS eff_wh_km
       FROM drives
      WHERE car_id = $1
        AND start_date + INTERVAL '9 hours' >= $2::timestamp
        AND start_date + INTERVAL '9 hours' <  $3::timestamp
        AND distance >= 10
        AND start_rated_range_km IS NOT NULL
        AND end_rated_range_km IS NOT NULL
        AND (start_rated_range_km - end_rated_range_km) > 0
      ORDER BY yr, mo,
               ((start_rated_range_km - end_rated_range_km) * ${KWH_PER_KM} / NULLIF(distance, 0) * 1000) ASC`,
    [carId, fromDate, toDate]
  );

  const map = new Map();
  const keyOf = (yr, mo) => `${yr}-${mo}`;
  for (const r of driveAgg.rows) {
    map.set(keyOf(r.yr, r.mo), {
      yr: r.yr, mo: r.mo,
      distance_km: r.distance_km, drive_count: r.drive_count,
      duration_min: r.duration_min, used_km: r.used_km,
      max_distance_km: r.max_distance_km, max_duration_min: r.max_duration_min, max_speed: r.max_speed,
      total_kwh: 0, charge_count: 0, avg_kwh: 0,
      home_charges: 0, other_charges: 0, fast_charges: 0, slow_charges: 0,
      best_long_drive_id: null, best_long_drive_distance: null,
      best_eff_drive_id: null, best_eff_drive_distance: null, best_eff_drive_wh_km: null,
    });
  }
  for (const r of chargeAgg.rows) {
    const k = keyOf(r.yr, r.mo);
    if (!map.has(k)) {
      map.set(k, {
        yr: r.yr, mo: r.mo,
        distance_km: 0, drive_count: 0, duration_min: 0, used_km: 0,
        max_distance_km: 0, max_duration_min: 0, max_speed: 0,
        total_kwh: r.total_kwh, charge_count: r.charge_count, avg_kwh: r.avg_kwh,
        home_charges: r.home_charges, other_charges: r.other_charges,
        fast_charges: r.fast_charges, slow_charges: r.slow_charges,
        best_long_drive_id: null, best_long_drive_distance: null,
        best_eff_drive_id: null, best_eff_drive_distance: null, best_eff_drive_wh_km: null,
      });
    } else {
      const row = map.get(k);
      row.total_kwh = r.total_kwh; row.charge_count = r.charge_count; row.avg_kwh = r.avg_kwh;
      row.home_charges = r.home_charges; row.other_charges = r.other_charges;
      row.fast_charges = r.fast_charges; row.slow_charges = r.slow_charges;
    }
  }
  for (const r of bestLong.rows) {
    const row = map.get(keyOf(r.yr, r.mo));
    if (row) {
      row.best_long_drive_id = r.id;
      row.best_long_drive_distance = r.distance;
    }
  }
  for (const r of bestEff.rows) {
    const row = map.get(keyOf(r.yr, r.mo));
    if (row) {
      row.best_eff_drive_id = r.id;
      row.best_eff_drive_distance = r.distance;
      row.best_eff_drive_wh_km = r.eff_wh_km;
    }
  }

  return withTxn(async (client) => {
    // 범위 내 기존 행 제거 후 upsert
    await client.query(
      `DELETE FROM dash_monthly_insights
        WHERE car_id = $1
          AND make_date(year::int, month::int, 1) >= $2::date
          AND make_date(year::int, month::int, 1) <  $3::date`,
      [carId, fromDate, toDate]
    );
    for (const row of map.values()) {
      await client.query(
        `INSERT INTO dash_monthly_insights (
           car_id, year, month,
           distance_km, drive_count, duration_min, used_km,
           max_distance_km, max_duration_min, max_speed,
           total_kwh, charge_count, avg_kwh,
           home_charges, other_charges, fast_charges, slow_charges,
           best_long_drive_id, best_long_drive_distance,
           best_eff_drive_id, best_eff_drive_distance, best_eff_drive_wh_km
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
         )
         ON CONFLICT (car_id, year, month) DO UPDATE SET
           distance_km = EXCLUDED.distance_km,
           drive_count = EXCLUDED.drive_count,
           duration_min = EXCLUDED.duration_min,
           used_km = EXCLUDED.used_km,
           max_distance_km = EXCLUDED.max_distance_km,
           max_duration_min = EXCLUDED.max_duration_min,
           max_speed = EXCLUDED.max_speed,
           total_kwh = EXCLUDED.total_kwh,
           charge_count = EXCLUDED.charge_count,
           avg_kwh = EXCLUDED.avg_kwh,
           home_charges = EXCLUDED.home_charges,
           other_charges = EXCLUDED.other_charges,
           fast_charges = EXCLUDED.fast_charges,
           slow_charges = EXCLUDED.slow_charges,
           best_long_drive_id = EXCLUDED.best_long_drive_id,
           best_long_drive_distance = EXCLUDED.best_long_drive_distance,
           best_eff_drive_id = EXCLUDED.best_eff_drive_id,
           best_eff_drive_distance = EXCLUDED.best_eff_drive_distance,
           best_eff_drive_wh_km = EXCLUDED.best_eff_drive_wh_km`,
        [
          carId, row.yr, row.mo,
          row.distance_km, row.drive_count, row.duration_min, row.used_km,
          row.max_distance_km, row.max_duration_min, row.max_speed,
          row.total_kwh, row.charge_count, row.avg_kwh,
          row.home_charges, row.other_charges, row.fast_charges, row.slow_charges,
          row.best_long_drive_id, row.best_long_drive_distance,
          row.best_eff_drive_id, row.best_eff_drive_distance, row.best_eff_drive_wh_km,
        ]
      );
    }
    return { months: map.size, ms: Date.now() - t0 };
  });
}
