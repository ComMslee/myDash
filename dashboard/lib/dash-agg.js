// 일별 사전 집계 (KST 기준) — TeslaMate DB 에 dash_ prefix 로 자체 테이블 보유.
//
// 무거운 풀스캔 라우트(/api/insights, /api/charge-all-time 등)의 hour×dow 그리드를
// 어제까지의 데이터는 미리 집계해 두고, 오늘은 라이브 쿼리로 머지하는 패턴 전제.
//
// 멱등성: refreshRange 는 최근 N 일을 항상 upsert (cron 실패 self-heal).
// 스키마: docs/PRECOMPUTE_PLAN.md Tier 2 참조.

import pool from '@/lib/db';

let tableReady = false;

export async function ensureSchema() {
  if (tableReady) return;
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
  tableReady = true;
}

/**
 * refreshRange — [fromDay, toDay) 사이의 KST 일자에 대해
 * dash_daily_drive_agg / dash_daily_charge_agg 를 upsert.
 *
 * 10분 wall-clock 틱 의미: drives/charging_processes 의 (start_date+9h, end_date+9h]
 * 구간 안에 :00,:10,..,:50 인 tick 이 몇 개 포함되는가 — insights/charge-all-time 의
 * generate_series 로직과 동일.
 *
 * @param {number|string} fromDay 'YYYY-MM-DD' 또는 Date — 포함
 * @param {number|string} toDay   'YYYY-MM-DD' 또는 Date — 제외
 * @returns {{drive_rows:number, charge_rows:number, ms:number}}
 */
export async function refreshRange(carId, fromDay, toDay) {
  const t0 = Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 주행 — hour 별 ticks_10min + 거리/시간/카운트/사용 range
    // tick 의 KST 시각(ts) 의 hour 로 hour 버킷, day 는 ts 의 DATE.
    // distance/duration/drive_count/used_km 은 drive 의 start_date+9h 시각의 hour 에 귀속.
    // → ticks 합산용 서브쿼리와 drive-level 합산용 서브쿼리를 FULL JOIN.
    const driveSql = `
      WITH ticks AS (
        SELECT
          (ts)::date                     AS day,
          EXTRACT(DOW  FROM ts)::int     AS dow,
          EXTRACT(HOUR FROM ts)::int     AS hour,
          COUNT(*)::int                  AS ticks_10min
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
          el,
          INTERVAL '10 minutes'
        ) AS ts
        WHERE ts >= sl
          AND ts >= $2::timestamp
          AND ts <  $3::timestamp
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

    // 우선 범위 내 기존 행 삭제 후 INSERT (PRIMARY KEY 충돌 안전, 멱등)
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

    // 충전 — hour 별 ticks_10min + 에너지/카운트/홈/고속
    const chargeSql = `
      WITH ticks AS (
        SELECT
          (ts)::date                     AS day,
          EXTRACT(DOW  FROM ts)::int     AS dow,
          EXTRACT(HOUR FROM ts)::int     AS hour,
          COUNT(*)::int                  AS ticks_10min
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
          el,
          INTERVAL '10 minutes'
        ) AS ts
        WHERE ts >= sl
          AND ts >= $2::timestamp
          AND ts <  $3::timestamp
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
 * readHourDow — 사전 집계 테이블에서 7×24 dow×hour 그리드 복원.
 * kind: 'drive' | 'charge'
 * sinceDay: 옵션, 'YYYY-MM-DD' 또는 Date — 해당 일 포함 이후만 합산.
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
