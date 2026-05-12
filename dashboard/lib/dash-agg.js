// 사전 집계 (KST 기준) — TeslaMate DB 에 dash_ prefix 로 자체 테이블 보유.
//
// Tier 2 풀:
//   dash_daily_drive_agg, dash_daily_charge_agg  — 일/시간 버킷, hour×dow + 일별 합산
//   dash_monthly_insights                         — 12개월 insights / monthly-history
//   dash_top_drives_cache                         — rankings TOP 50/메트릭
//   dash_place_clusters / dash_place_geo          — frequent-places 끝점 0.0005° 빈도
//
// 멱등성: 각 refresh* 는 안전하게 재실행 가능 (DELETE+INSERT 또는 UPSERT). cron 실패 self-heal.
// 스키마: docs/PRECOMPUTE_PLAN.md Tier 2 참조.

import pool from '@/lib/db';
import { KWH_PER_KM } from '@/lib/constants';

let tableReady = false;
let bootstrapInflight = null;

export async function ensureSchema() {
  if (tableReady) return;
  // 일별 주행/충전 (기존)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dash_daily_drive_agg (
      car_id        smallint NOT NULL,
      day           date     NOT NULL,
      dow           smallint NOT NULL,
      hour          smallint NOT NULL,
      ticks_10min   integer  NOT NULL DEFAULT 0,
      distance_km   real     NOT NULL DEFAULT 0,
      duration_min  integer  NOT NULL DEFAULT 0,
      drive_count   integer  NOT NULL DEFAULT 0,
      used_km       real     NOT NULL DEFAULT 0,
      PRIMARY KEY (car_id, day, hour)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dash_daily_charge_agg (
      car_id        smallint NOT NULL,
      day           date     NOT NULL,
      dow           smallint NOT NULL,
      hour          smallint NOT NULL,
      ticks_10min   integer  NOT NULL DEFAULT 0,
      energy_kwh    real     NOT NULL DEFAULT 0,
      charge_count  integer  NOT NULL DEFAULT 0,
      home_count    integer  NOT NULL DEFAULT 0,
      fast_count    integer  NOT NULL DEFAULT 0,
      PRIMARY KEY (car_id, day, hour)
    )
  `);
  // 월별 insights
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dash_monthly_insights (
      car_id                    smallint NOT NULL,
      year                      smallint NOT NULL,
      month                     smallint NOT NULL,
      distance_km               real     NOT NULL DEFAULT 0,
      drive_count               integer  NOT NULL DEFAULT 0,
      duration_min              integer  NOT NULL DEFAULT 0,
      used_km                   real     NOT NULL DEFAULT 0,
      max_distance_km           real     NOT NULL DEFAULT 0,
      max_duration_min          integer  NOT NULL DEFAULT 0,
      max_speed                 integer  NOT NULL DEFAULT 0,
      total_kwh                 real     NOT NULL DEFAULT 0,
      charge_count              integer  NOT NULL DEFAULT 0,
      avg_kwh                   real     NOT NULL DEFAULT 0,
      home_charges              integer  NOT NULL DEFAULT 0,
      other_charges             integer  NOT NULL DEFAULT 0,
      fast_charges              integer  NOT NULL DEFAULT 0,
      slow_charges              integer  NOT NULL DEFAULT 0,
      best_long_drive_id        bigint,
      best_long_drive_distance  real,
      best_eff_drive_id         bigint,
      best_eff_drive_distance   real,
      best_eff_drive_wh_km      real,
      PRIMARY KEY (car_id, year, month)
    )
  `);
  // top drives 캐시 (truncate-replace)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dash_top_drives_cache (
      car_id     smallint NOT NULL,
      metric     text     NOT NULL,
      rank       smallint NOT NULL,
      drive_id   bigint,
      value      real,
      start_date timestamptz,
      PRIMARY KEY (car_id, metric, rank)
    )
  `);
  // place clusters — drive end-location 0.0005° bin
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dash_place_clusters (
      car_id          smallint     NOT NULL,
      bin_lat         numeric(7,4) NOT NULL,
      bin_lon         numeric(7,4) NOT NULL,
      visit_count     integer      NOT NULL DEFAULT 0,
      top_origin_lat  real,
      top_origin_lon  real,
      last_visited_at timestamptz,
      PRIMARY KEY (car_id, bin_lat, bin_lon)
    )
  `);
  // 클러스터 라벨 캐시 (kakao_address_cache 와 별도 — bin-coord 키)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dash_place_geo (
      coord_key  text PRIMARY KEY,
      label      text,
      updated_at timestamptz DEFAULT now()
    )
  `);
  tableReady = true;
}

/**
 * bootstrapIfEmpty — ensureSchema 후 호출. 디폴트 car 의 집계가 비어 있으면 풀 백필.
 * 같은 컨테이너 라이프타임에서 한 번만 (inflight Promise 로 dedup).
 */
export async function bootstrapIfEmpty(carId) {
  if (!carId) return null;
  if (bootstrapInflight) return bootstrapInflight;
  bootstrapInflight = (async () => {
    try {
      // 차량의 최초 주행/충전 시각으로 백필 범위 결정
      const earliest = await pool.query(
        `SELECT LEAST(
           (SELECT MIN(start_date) FROM drives WHERE car_id = $1),
           (SELECT MIN(start_date) FROM charging_processes WHERE car_id = $1)
         ) AS first_ts`,
        [carId]
      );
      const firstTs = earliest.rows[0]?.first_ts;
      if (!firstTs) return { ok: true, empty_history: true };

      // KST 날짜로 변환
      const firstKstMs = new Date(firstTs).getTime() + 9 * 3600_000;
      const firstKst = new Date(firstKstMs);
      const fromStr = `${firstKst.getUTCFullYear()}-${String(firstKst.getUTCMonth() + 1).padStart(2, '0')}-01`;

      const nowKstMs = Date.now() + 9 * 3600_000;
      const kstNow = new Date(nowKstMs);
      const tomorrowKst = new Date(Date.UTC(
        kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate() + 1
      ));
      const toStr = tomorrowKst.toISOString().slice(0, 10);

      const out = { from: fromStr, to: toStr };

      const dailyEmpty = await pool.query(
        `SELECT 1 FROM dash_daily_drive_agg WHERE car_id = $1 LIMIT 1`,
        [carId]
      );
      if (dailyEmpty.rows.length === 0) {
        out.daily = await refreshRange(carId, fromStr, toStr);
      }
      const monthlyEmpty = await pool.query(
        `SELECT 1 FROM dash_monthly_insights WHERE car_id = $1 LIMIT 1`,
        [carId]
      );
      if (monthlyEmpty.rows.length === 0) {
        // 전체 히스토리 (최대 240개월) 충분히 커버
        out.monthly = await refreshMonthlyInsights(carId, fromStr, toStr, 240);
      }
      const topEmpty = await pool.query(
        `SELECT 1 FROM dash_top_drives_cache WHERE car_id = $1 LIMIT 1`,
        [carId]
      );
      if (topEmpty.rows.length === 0) {
        out.top = await refreshTopDrivesCache(carId);
      }
      const placesEmpty = await pool.query(
        `SELECT 1 FROM dash_place_clusters WHERE car_id = $1 LIMIT 1`,
        [carId]
      );
      if (placesEmpty.rows.length === 0) {
        out.places = await refreshPlaceClusters(carId);
      }
      return out;
    } catch (err) {
      console.error('[dash-agg] bootstrap error:', err);
      throw err;
    }
  })();
  try {
    return await bootstrapInflight;
  } finally {
    // 성공/실패 후 inflight 해제 (성공 시 다음 호출은 위에서 즉시 빈 결과 통과)
    bootstrapInflight = null;
  }
}

/**
 * refreshRange — [fromDay, toDay) KST 일자에 대해 dash_daily_*_agg upsert.
 */
export async function refreshRange(carId, fromDay, toDay) {
  const t0 = Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const driveSql = `
      WITH ticks AS (
        SELECT
          (hour_start)::date              AS day,
          EXTRACT(DOW  FROM hour_start)::int AS dow,
          EXTRACT(HOUR FROM hour_start)::int AS hour,
          SUM(CEIL(
            EXTRACT(EPOCH FROM (
              LEAST(el, hour_start + INTERVAL '1 hour')
              - GREATEST(sl, hour_start)
            )) / 600.0
          ))::int                         AS ticks_10min
        FROM (
          SELECT start_date + INTERVAL '9 hours' AS sl,
                 COALESCE(end_date, start_date) + INTERVAL '9 hours' AS el
          FROM drives
          WHERE car_id = $1
            AND COALESCE(end_date, start_date) + INTERVAL '9 hours' >= $2::timestamp
            AND start_date + INTERVAL '9 hours'                       <  $3::timestamp
        ) d
        CROSS JOIN LATERAL generate_series(
          date_trunc('hour', sl),
          date_trunc('hour', el),
          INTERVAL '1 hour'
        ) AS hour_start
        WHERE LEAST(el, hour_start + INTERVAL '1 hour') > GREATEST(sl, hour_start)
          AND hour_start >= date_trunc('hour', $2::timestamp)
          AND hour_start <  $3::timestamp
        GROUP BY 1,2,3
      ),
      drive_stats AS (
        SELECT
          ((start_date + INTERVAL '9 hours'))::date                     AS day,
          EXTRACT(DOW  FROM (start_date + INTERVAL '9 hours'))::int     AS dow,
          EXTRACT(HOUR FROM (start_date + INTERVAL '9 hours'))::int     AS hour,
          COALESCE(SUM(distance), 0)::real                              AS distance_km,
          COALESCE(SUM(duration_min), 0)::int                           AS duration_min,
          COUNT(*)::int                                                 AS drive_count,
          COALESCE(SUM(
            CASE WHEN start_rated_range_km IS NOT NULL
                  AND end_rated_range_km IS NOT NULL
                  AND (start_rated_range_km - end_rated_range_km) > 0
                 THEN (start_rated_range_km - end_rated_range_km)
                 ELSE 0
            END
          ), 0)::real                                                   AS used_km
        FROM drives
        WHERE car_id = $1
          AND start_date + INTERVAL '9 hours' >= $2::timestamp
          AND start_date + INTERVAL '9 hours' <  $3::timestamp
        GROUP BY 1,2,3
      )
      SELECT
        COALESCE(t.day, s.day)                AS day,
        COALESCE(t.dow, s.dow)                AS dow,
        COALESCE(t.hour, s.hour)              AS hour,
        COALESCE(t.ticks_10min, 0)            AS ticks_10min,
        COALESCE(s.distance_km, 0)::real      AS distance_km,
        COALESCE(s.duration_min, 0)::int      AS duration_min,
        COALESCE(s.drive_count, 0)::int       AS drive_count,
        COALESCE(s.used_km, 0)::real          AS used_km
      FROM ticks t
      FULL OUTER JOIN drive_stats s
        ON t.day = s.day AND t.hour = s.hour
    `;
    const driveRows = await client.query(driveSql, [carId, fromDay, toDay]);

    await client.query(
      `DELETE FROM dash_daily_drive_agg
        WHERE car_id = $1 AND day >= $2::date AND day < $3::date`,
      [carId, fromDay, toDay]
    );
    for (const r of driveRows.rows) {
      await client.query(
        `INSERT INTO dash_daily_drive_agg
           (car_id, day, dow, hour, ticks_10min, distance_km, duration_min, drive_count, used_km)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (car_id, day, hour) DO UPDATE SET
           dow          = EXCLUDED.dow,
           ticks_10min  = EXCLUDED.ticks_10min,
           distance_km  = EXCLUDED.distance_km,
           duration_min = EXCLUDED.duration_min,
           drive_count  = EXCLUDED.drive_count,
           used_km      = EXCLUDED.used_km`,
        [carId, r.day, r.dow, r.hour, r.ticks_10min, r.distance_km, r.duration_min, r.drive_count, r.used_km]
      );
    }

    const chargeSql = `
      WITH ticks AS (
        SELECT
          (hour_start)::date              AS day,
          EXTRACT(DOW  FROM hour_start)::int AS dow,
          EXTRACT(HOUR FROM hour_start)::int AS hour,
          SUM(CEIL(
            EXTRACT(EPOCH FROM (
              LEAST(el, hour_start + INTERVAL '1 hour')
              - GREATEST(sl, hour_start)
            )) / 600.0
          ))::int                         AS ticks_10min
        FROM (
          SELECT start_date + INTERVAL '9 hours' AS sl,
                 COALESCE(end_date, start_date) + INTERVAL '9 hours' AS el
          FROM charging_processes
          WHERE car_id = $1
            AND charge_energy_added IS NOT NULL
            AND COALESCE(end_date, start_date) + INTERVAL '9 hours' >= $2::timestamp
            AND start_date + INTERVAL '9 hours'                       <  $3::timestamp
        ) c
        CROSS JOIN LATERAL generate_series(
          date_trunc('hour', sl),
          date_trunc('hour', el),
          INTERVAL '1 hour'
        ) AS hour_start
        WHERE LEAST(el, hour_start + INTERVAL '1 hour') > GREATEST(sl, hour_start)
          AND hour_start >= date_trunc('hour', $2::timestamp)
          AND hour_start <  $3::timestamp
        GROUP BY 1,2,3
      ),
      charge_stats AS (
        SELECT
          ((cp.start_date + INTERVAL '9 hours'))::date                     AS day,
          EXTRACT(DOW  FROM (cp.start_date + INTERVAL '9 hours'))::int     AS dow,
          EXTRACT(HOUR FROM (cp.start_date + INTERVAL '9 hours'))::int     AS hour,
          COALESCE(SUM(cp.charge_energy_added), 0)::real                   AS energy_kwh,
          COUNT(*)::int                                                    AS charge_count,
          COUNT(*) FILTER (WHERE cp.geofence_id IS NOT NULL)::int          AS home_count,
          COUNT(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM charges ch
            WHERE ch.charging_process_id = cp.id
              AND ch.fast_charger_present = true
          ))::int                                                          AS fast_count
        FROM charging_processes cp
        WHERE cp.car_id = $1
          AND cp.charge_energy_added IS NOT NULL
          AND cp.start_date + INTERVAL '9 hours' >= $2::timestamp
          AND cp.start_date + INTERVAL '9 hours' <  $3::timestamp
        GROUP BY 1,2,3
      )
      SELECT
        COALESCE(t.day, s.day)                AS day,
        COALESCE(t.dow, s.dow)                AS dow,
        COALESCE(t.hour, s.hour)              AS hour,
        COALESCE(t.ticks_10min, 0)            AS ticks_10min,
        COALESCE(s.energy_kwh, 0)::real       AS energy_kwh,
        COALESCE(s.charge_count, 0)::int      AS charge_count,
        COALESCE(s.home_count, 0)::int        AS home_count,
        COALESCE(s.fast_count, 0)::int        AS fast_count
      FROM ticks t
      FULL OUTER JOIN charge_stats s
        ON t.day = s.day AND t.hour = s.hour
    `;
    const chargeRows = await client.query(chargeSql, [carId, fromDay, toDay]);

    await client.query(
      `DELETE FROM dash_daily_charge_agg
        WHERE car_id = $1 AND day >= $2::date AND day < $3::date`,
      [carId, fromDay, toDay]
    );
    for (const r of chargeRows.rows) {
      await client.query(
        `INSERT INTO dash_daily_charge_agg
           (car_id, day, dow, hour, ticks_10min, energy_kwh, charge_count, home_count, fast_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (car_id, day, hour) DO UPDATE SET
           dow          = EXCLUDED.dow,
           ticks_10min  = EXCLUDED.ticks_10min,
           energy_kwh   = EXCLUDED.energy_kwh,
           charge_count = EXCLUDED.charge_count,
           home_count   = EXCLUDED.home_count,
           fast_count   = EXCLUDED.fast_count`,
        [carId, r.day, r.dow, r.hour, r.ticks_10min, r.energy_kwh, r.charge_count, r.home_count, r.fast_count]
      );
    }

    await client.query('COMMIT');
    return {
      drive_rows: driveRows.rowCount,
      charge_rows: chargeRows.rowCount,
      ms: Date.now() - t0,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * refreshMonthlyInsights — 월별 주행/충전 + 베스트 long/eff drive upsert.
 *
 * @param fromDate  YYYY-MM-DD (KST, 시작 포함)
 * @param toDate    YYYY-MM-DD (KST, 끝 제외)
 * @param maxMonths 안전한 상한 (기본 36)
 */
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

  // 월별 best long drive
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

  // 월별 best eff drive (distance >= 10, used > 0, 최저 wh/km)
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

  // 월별 합치기
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 범위 내 기존 행 제거 후 upsert (drives 도 charges 도 없는 달은 행 자체 없음)
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
    await client.query('COMMIT');
    return { months: map.size, ms: Date.now() - t0 };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const TOP_METRICS = [
  'drive_distance', 'drive_duration', 'drive_avg_speed', 'drive_eff',
  'day_distance',   'day_duration',   'day_avg_speed',   'day_eff',
];

const USED_KM_EXPR = `SUM(CASE WHEN start_rated_range_km IS NOT NULL AND end_rated_range_km IS NOT NULL
                                   AND (start_rated_range_km - end_rated_range_km) > 0
                              THEN (start_rated_range_km - end_rated_range_km) ELSE 0 END)`;

function topDriveSql(metric, limit) {
  let orderExpr, extraWhere = '', orderDir = 'DESC';
  if (metric === 'drive_distance') orderExpr = 'd.distance';
  else if (metric === 'drive_duration') orderExpr = 'd.duration_min';
  else if (metric === 'drive_avg_speed') {
    orderExpr = 'd.distance / NULLIF(d.duration_min, 0) * 60';
    extraWhere = ' AND d.distance >= 10 AND d.duration_min > 0';
  } else {
    orderExpr = `(d.start_rated_range_km - d.end_rated_range_km) * ${KWH_PER_KM} / NULLIF(d.distance, 0) * 1000`;
    extraWhere = ' AND d.distance >= 10 AND d.start_rated_range_km IS NOT NULL AND d.end_rated_range_km IS NOT NULL AND (d.start_rated_range_km - d.end_rated_range_km) > 0';
    orderDir = 'ASC';
  }
  return `
    SELECT d.id::bigint AS drive_id,
           d.start_date,
           (${orderExpr})::real AS value
      FROM drives d
     WHERE d.car_id = $1 AND (${orderExpr}) IS NOT NULL${extraWhere}
     ORDER BY (${orderExpr}) ${orderDir} NULLS LAST
     LIMIT ${limit}
  `;
}

function topDaySql(metric, limit) {
  let orderExpr, havingExpr, orderDir = 'DESC';
  if (metric === 'day_distance') {
    orderExpr = 'SUM(distance)';
    havingExpr = 'SUM(distance) > 0';
  } else if (metric === 'day_duration') {
    orderExpr = 'SUM(duration_min)';
    havingExpr = 'SUM(duration_min) > 0';
  } else if (metric === 'day_avg_speed') {
    orderExpr = 'SUM(distance) / NULLIF(SUM(duration_min), 0) * 60';
    havingExpr = 'SUM(distance) >= 10 AND SUM(duration_min) > 0';
  } else {
    orderExpr = `${USED_KM_EXPR} * ${KWH_PER_KM} / NULLIF(SUM(distance), 0) * 1000`;
    havingExpr = `SUM(distance) >= 10 AND ${USED_KM_EXPR} > 0`;
    orderDir = 'ASC';
  }
  return `
    SELECT NULL::bigint AS drive_id,
           (DATE(start_date + INTERVAL '9 hours'))::timestamptz AS start_date,
           (${orderExpr})::real AS value
      FROM drives
     WHERE car_id = $1
     GROUP BY DATE(start_date + INTERVAL '9 hours')
    HAVING ${havingExpr}
     ORDER BY ${orderExpr} ${orderDir}
     LIMIT ${limit}
  `;
}

/**
 * refreshTopDrivesCache — 8개 메트릭 × TOP 50 truncate-replace.
 */
export async function refreshTopDrivesCache(carId, limit = 50) {
  const t0 = Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM dash_top_drives_cache WHERE car_id = $1`, [carId]);
    let total = 0;
    for (const metric of TOP_METRICS) {
      const sql = metric.startsWith('drive_')
        ? topDriveSql(metric, limit)
        : topDaySql(metric, limit);
      const rows = await client.query(sql, [carId]);
      let rank = 1;
      for (const r of rows.rows) {
        await client.query(
          `INSERT INTO dash_top_drives_cache (car_id, metric, rank, drive_id, value, start_date)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [carId, metric, rank++, r.drive_id, r.value, r.start_date]
        );
        total++;
      }
    }
    await client.query('COMMIT');
    return { rows: total, ms: Date.now() - t0 };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * refreshPlaceClusters — drive 끝 좌표 0.0005° (~55m) bin.
 * top_origin_{lat,lon} = 그 bin 에 도착한 drives 의 시작 좌표 중 최빈 (0.0005° bin 으로 그룹).
 */
export async function refreshPlaceClusters(carId) {
  const t0 = Date.now();
  // 끝점 클러스터
  const clusters = await pool.query(
    `SELECT
       (ROUND(COALESCE(g.latitude,  a.latitude)::numeric  * 2000) / 2000)::numeric(7,4) AS bin_lat,
       (ROUND(COALESCE(g.longitude, a.longitude)::numeric * 2000) / 2000)::numeric(7,4) AS bin_lon,
       COUNT(*)::int AS visit_count,
       MAX(d.start_date) AS last_visited_at
     FROM drives d
     LEFT JOIN geofences g ON g.id = d.end_geofence_id
     LEFT JOIN addresses a ON a.id = d.end_address_id
     WHERE d.car_id = $1
       AND COALESCE(g.latitude, a.latitude) IS NOT NULL
     GROUP BY 1, 2`,
    [carId]
  );

  // top origin per bin
  const origins = await pool.query(
    `SELECT bin_lat, bin_lon, origin_lat::real AS origin_lat, origin_lon::real AS origin_lon FROM (
       SELECT
         (ROUND(COALESCE(eg.latitude,  ea.latitude)::numeric  * 2000) / 2000)::numeric(7,4) AS bin_lat,
         (ROUND(COALESCE(eg.longitude, ea.longitude)::numeric * 2000) / 2000)::numeric(7,4) AS bin_lon,
         (ROUND(COALESCE(sg.latitude,  sa.latitude)::numeric  * 2000) / 2000)::numeric(7,4) AS origin_lat,
         (ROUND(COALESCE(sg.longitude, sa.longitude)::numeric * 2000) / 2000)::numeric(7,4) AS origin_lon,
         COUNT(*) AS cnt,
         ROW_NUMBER() OVER (
           PARTITION BY
             (ROUND(COALESCE(eg.latitude,  ea.latitude)::numeric  * 2000) / 2000)::numeric(7,4),
             (ROUND(COALESCE(eg.longitude, ea.longitude)::numeric * 2000) / 2000)::numeric(7,4)
           ORDER BY COUNT(*) DESC
         ) AS rn
       FROM drives d
       LEFT JOIN geofences eg ON eg.id = d.end_geofence_id
       LEFT JOIN addresses ea ON ea.id = d.end_address_id
       LEFT JOIN geofences sg ON sg.id = d.start_geofence_id
       LEFT JOIN addresses sa ON sa.id = d.start_address_id
       WHERE d.car_id = $1
         AND COALESCE(eg.latitude, ea.latitude) IS NOT NULL
         AND COALESCE(sg.latitude, sa.latitude) IS NOT NULL
       GROUP BY 1, 2, 3, 4
     ) sub WHERE rn = 1`,
    [carId]
  );
  const originMap = new Map();
  for (const r of origins.rows) {
    originMap.set(`${r.bin_lat},${r.bin_lon}`, { lat: r.origin_lat, lon: r.origin_lon });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM dash_place_clusters WHERE car_id = $1`, [carId]);
    for (const c of clusters.rows) {
      const o = originMap.get(`${c.bin_lat},${c.bin_lon}`);
      await client.query(
        `INSERT INTO dash_place_clusters
           (car_id, bin_lat, bin_lon, visit_count, top_origin_lat, top_origin_lon, last_visited_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [carId, c.bin_lat, c.bin_lon, c.visit_count, o?.lat ?? null, o?.lon ?? null, c.last_visited_at]
      );
    }
    await client.query('COMMIT');
    return { clusters: clusters.rowCount, ms: Date.now() - t0 };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * readHourDow — 사전 집계 테이블에서 7×24 dow×hour 그리드 복원.
 */
export async function readHourDow(carId, kind, sinceDay = null) {
  const table = kind === 'charge' ? 'dash_daily_charge_agg' : 'dash_daily_drive_agg';
  const params = [carId];
  let where = 'car_id = $1';
  if (sinceDay) {
    params.push(sinceDay);
    where += ' AND day >= $2::date';
  }
  const q = await pool.query(
    `SELECT dow, hour, SUM(ticks_10min)::int AS count
       FROM ${table}
      WHERE ${where}
      GROUP BY dow, hour`,
    params
  );
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of q.rows) grid[r.dow][r.hour] = r.count;
  return grid;
}
