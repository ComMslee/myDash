import pool from '@/lib/db';
import { withTxn } from './_txn';

// refreshRange — [fromDay, toDay) KST 일자에 대해 dash_daily_*_agg upsert.
// ticks_10min = 10분 wall-clock 점유 틱 합산 (drives/charging_processes overlap × hour bucket).
export async function refreshRange(carId, fromDay, toDay) {
  const t0 = Date.now();
  return withTxn(async (client) => {
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

    return {
      drive_rows: driveRows.rowCount,
      charge_rows: chargeRows.rowCount,
      ms: Date.now() - t0,
    };
  });
}

// readHourDow — 사전 집계 테이블에서 7×24 dow×hour 그리드 복원.
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
