import { KWH_PER_KM } from '@/lib/constants';
import { withTxn } from './_txn';

const TOP_METRICS = [
  'drive_distance', 'drive_duration', 'drive_avg_speed', 'drive_eff',
  'day_distance',   'day_duration',   'day_avg_speed',   'day_eff',
];

const USED_KM_EXPR = `SUM(CASE WHEN start_rated_range_km IS NOT NULL AND end_rated_range_km IS NOT NULL
                                   AND (start_rated_range_km - end_rated_range_km) > 0
                              THEN (start_rated_range_km - end_rated_range_km) ELSE 0 END)`;

function topDriveSql(metric, limit) {
  let orderExpr;
  let extraWhere = '';
  let orderDir = 'DESC';
  if (metric === 'drive_distance') {
    orderExpr = 'd.distance';
  } else if (metric === 'drive_duration') {
    orderExpr = 'd.duration_min';
  } else if (metric === 'drive_avg_speed') {
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
  let orderExpr;
  let havingExpr;
  let orderDir = 'DESC';
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

// refreshTopDrivesCache — 8개 메트릭 × TOP 50 truncate-replace.
export async function refreshTopDrivesCache(carId, limit = 50) {
  const t0 = Date.now();
  return withTxn(async (client) => {
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
    return { rows: total, ms: Date.now() - t0 };
  });
}
