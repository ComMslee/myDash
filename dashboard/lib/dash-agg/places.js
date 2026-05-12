import pool from '@/lib/db';
import { withTxn } from './_txn';

// 0.0005° (~55m) bin = 1/2000 도. 좌표 라운딩 식 `ROUND(x * BIN_PER_DEG) / BIN_PER_DEG`.
const PLACE_BIN_PER_DEG = 2000;

// refreshPlaceClusters — drive 끝 좌표 bin 빈도 truncate-replace.
// top_origin_{lat,lon} = 그 bin 에 도착한 drives 의 시작 좌표 중 최빈 (동일 bin 격자).
export async function refreshPlaceClusters(carId) {
  const t0 = Date.now();
  const clusters = await pool.query(
    `SELECT
       (ROUND(COALESCE(g.latitude,  a.latitude)::numeric  * ${PLACE_BIN_PER_DEG}) / ${PLACE_BIN_PER_DEG})::numeric(7,4) AS bin_lat,
       (ROUND(COALESCE(g.longitude, a.longitude)::numeric * ${PLACE_BIN_PER_DEG}) / ${PLACE_BIN_PER_DEG})::numeric(7,4) AS bin_lon,
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

  const origins = await pool.query(
    `SELECT bin_lat, bin_lon, origin_lat::real AS origin_lat, origin_lon::real AS origin_lon FROM (
       SELECT
         (ROUND(COALESCE(eg.latitude,  ea.latitude)::numeric  * ${PLACE_BIN_PER_DEG}) / ${PLACE_BIN_PER_DEG})::numeric(7,4) AS bin_lat,
         (ROUND(COALESCE(eg.longitude, ea.longitude)::numeric * ${PLACE_BIN_PER_DEG}) / ${PLACE_BIN_PER_DEG})::numeric(7,4) AS bin_lon,
         (ROUND(COALESCE(sg.latitude,  sa.latitude)::numeric  * ${PLACE_BIN_PER_DEG}) / ${PLACE_BIN_PER_DEG})::numeric(7,4) AS origin_lat,
         (ROUND(COALESCE(sg.longitude, sa.longitude)::numeric * ${PLACE_BIN_PER_DEG}) / ${PLACE_BIN_PER_DEG})::numeric(7,4) AS origin_lon,
         COUNT(*) AS cnt,
         ROW_NUMBER() OVER (
           PARTITION BY
             (ROUND(COALESCE(eg.latitude,  ea.latitude)::numeric  * ${PLACE_BIN_PER_DEG}) / ${PLACE_BIN_PER_DEG})::numeric(7,4),
             (ROUND(COALESCE(eg.longitude, ea.longitude)::numeric * ${PLACE_BIN_PER_DEG}) / ${PLACE_BIN_PER_DEG})::numeric(7,4)
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

  return withTxn(async (client) => {
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
    return { clusters: clusters.rowCount, ms: Date.now() - t0 };
  });
}
