import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';
import { batchReverseGeocode } from '@/lib/kakao-geo';
import { withCache } from '@/lib/server-cache';
import { ensureSchema, bootstrapIfEmpty } from '@/lib/dash-agg';

export const dynamic = 'force-dynamic';

const PINNED_GEOFENCE_NAMES = ['집', '회사', 'Home', 'Work'];
const LIMIT = 100;

export async function GET(request) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const force = new URL(request.url).searchParams.get('refresh') === '1';
  try {
    const car = await getDefaultCar();
    if (!car) {
      return Response.json({ places: [] });
    }
    const carId = car.id;

    await ensureSchema();
    await bootstrapIfEmpty(carId);

    return Response.json(await withCache(`frequent-places:${carId}`, 300_000, async () => {

    // dash_place_clusters 에서 TOP-N
    const clusters = await pool.query(
      `SELECT bin_lat, bin_lon, visit_count, top_origin_lat, top_origin_lon, last_visited_at
         FROM dash_place_clusters
        WHERE car_id = $1
        ORDER BY visit_count DESC
        LIMIT $2`,
      [carId, LIMIT]
    );

    if (clusters.rows.length === 0) {
      return { places: [] };
    }

    // 클러스터별 메타데이터 (지오펜스/주소/city/first_visit/avg_dist/avg_dur) 한 번 더 조회.
    // bin 좌표로 drives 끝점 매칭 — bin 폭 0.0005°.
    const binPairs = clusters.rows.map(c => [parseFloat(c.bin_lat), parseFloat(c.bin_lon)]);
    const binLatsArr = binPairs.map(([la]) => la);
    const binLonsArr = binPairs.map(([, lo]) => lo);
    const metaResult = await pool.query(
      `WITH bins AS (
         SELECT
           (ROUND(COALESCE(g.latitude,  a.latitude)::numeric  * 2000) / 2000)::numeric(7,4) AS bin_lat,
           (ROUND(COALESCE(g.longitude, a.longitude)::numeric * 2000) / 2000)::numeric(7,4) AS bin_lon,
           MODE() WITHIN GROUP (ORDER BY g.name) FILTER (WHERE g.name IS NOT NULL) AS geofence_name,
           MODE() WITHIN GROUP (ORDER BY a.city) AS city,
           MODE() WITHIN GROUP (ORDER BY COALESCE(g.name, NULLIF(TRIM(CONCAT_WS(' ', a.road, a.house_number)), ''))) AS label,
           MIN(d.start_date) AS first_visit,
           COALESCE(AVG(d.distance), 0)::float AS avg_distance,
           COALESCE(AVG(d.duration_min), 0)::float AS avg_duration
         FROM drives d
         LEFT JOIN geofences g ON g.id = d.end_geofence_id
         LEFT JOIN addresses a ON a.id = d.end_address_id
         WHERE d.car_id = $1
           AND COALESCE(g.latitude, a.latitude) IS NOT NULL
         GROUP BY 1, 2
       )
       SELECT * FROM bins
       WHERE (bin_lat, bin_lon) IN (
         SELECT * FROM UNNEST($2::numeric[], $3::numeric[])
       )`,
      [carId, binLatsArr, binLonsArr]
    );
    const metaByKey = new Map();
    for (const r of metaResult.rows) {
      metaByKey.set(`${r.bin_lat},${r.bin_lon}`, r);
    }

    // 출발지 TOP3 per place — drives 에서 추출 (캐시는 top_origin 만 보유 → 사용자 표시용은 라이브 3개 유지)
    const originResult = await pool.query(
      `SELECT place_key, start_label, start_geofence_name, start_lat, start_lng, cnt FROM (
         SELECT
           (ROUND(COALESCE(eg.latitude,  ea.latitude)::numeric  * 2000) / 2000)::numeric(7,4)::text || ',' ||
           (ROUND(COALESCE(eg.longitude, ea.longitude)::numeric * 2000) / 2000)::numeric(7,4)::text AS place_key,
           COALESCE(sg.name, NULLIF(TRIM(CONCAT_WS(' ', sa.road, sa.house_number)), '')) AS start_label,
           sg.name AS start_geofence_name,
           AVG(COALESCE(sg.latitude, sa.latitude))::float AS start_lat,
           AVG(COALESCE(sg.longitude, sa.longitude))::float AS start_lng,
           COUNT(*) AS cnt,
           ROW_NUMBER() OVER (
             PARTITION BY
               (ROUND(COALESCE(eg.latitude,  ea.latitude)::numeric  * 2000) / 2000)::numeric(7,4)::text || ',' ||
               (ROUND(COALESCE(eg.longitude, ea.longitude)::numeric * 2000) / 2000)::numeric(7,4)::text
             ORDER BY COUNT(*) DESC
           ) AS rn
         FROM drives d
         LEFT JOIN geofences eg ON eg.id = d.end_geofence_id
         LEFT JOIN addresses ea ON ea.id = d.end_address_id
         LEFT JOIN geofences sg ON sg.id = d.start_geofence_id
         LEFT JOIN addresses sa ON sa.id = d.start_address_id
         WHERE d.car_id = $1
           AND COALESCE(eg.latitude, ea.latitude) IS NOT NULL
         GROUP BY
           (ROUND(COALESCE(eg.latitude,  ea.latitude)::numeric  * 2000) / 2000)::numeric(7,4)::text || ',' ||
           (ROUND(COALESCE(eg.longitude, ea.longitude)::numeric * 2000) / 2000)::numeric(7,4)::text,
           COALESCE(sg.name, NULLIF(TRIM(CONCAT_WS(' ', sa.road, sa.house_number)), '')),
           sg.name
       ) sub WHERE rn <= 3`,
      [carId]
    );

    const originRows = originResult.rows;
    const originCoords = originRows.map(r => ({
      lat: !r.start_geofence_name && r.start_lat ? parseFloat(r.start_lat) : null,
      lng: !r.start_geofence_name && r.start_lng ? parseFloat(r.start_lng) : null,
    }));
    const originKakaoLabels = await batchReverseGeocode(originCoords);

    const originMap = {};
    for (let i = 0; i < originRows.length; i++) {
      const row = originRows[i];
      const label = row.start_geofence_name || originKakaoLabels[i] || row.start_label;
      if (!originMap[row.place_key]) originMap[row.place_key] = [];
      originMap[row.place_key].push({ label, count: parseInt(row.cnt) });
    }

    // 클러스터 라벨 — dash_place_geo 캐시 우선, miss 는 batchReverseGeocode (kakao_address_cache 활용)
    const labelCacheRes = await pool.query(
      `SELECT coord_key, label FROM dash_place_geo WHERE coord_key = ANY($1::text[])`,
      [clusters.rows.map(c => `${c.bin_lat},${c.bin_lon}`)]
    );
    const cachedLabels = new Map();
    for (const r of labelCacheRes.rows) cachedLabels.set(r.coord_key, r.label);

    const needGeocode = clusters.rows
      .map((c, i) => ({ i, key: `${c.bin_lat},${c.bin_lon}`, lat: parseFloat(c.bin_lat), lng: parseFloat(c.bin_lon) }))
      .filter(x => !cachedLabels.has(x.key));
    const freshLabels = needGeocode.length > 0
      ? await batchReverseGeocode(needGeocode.map(x => ({ lat: x.lat, lng: x.lng })))
      : [];
    // 캐시 upsert (TTL — dash_place_geo 자체는 영구. 갱신은 30일 정책으로 추후 추가 가능)
    for (let i = 0; i < needGeocode.length; i++) {
      const key = needGeocode[i].key;
      const label = freshLabels[i] || null;
      cachedLabels.set(key, label);
      await pool.query(
        `INSERT INTO dash_place_geo (coord_key, label) VALUES ($1, $2)
         ON CONFLICT (coord_key) DO UPDATE SET label = EXCLUDED.label, updated_at = now()`,
        [key, label]
      );
    }

    const allPlaces = clusters.rows.map((c) => {
      const key = `${c.bin_lat},${c.bin_lon}`;
      const meta = metaByKey.get(key) || {};
      const geofenceName = meta.geofence_name || null;
      const kakaoLabel = cachedLabels.get(key) || null;
      const dbLabel = meta.label || null;
      const label = geofenceName || kakaoLabel || dbLabel || '알 수 없는 장소';
      const lat = parseFloat(c.bin_lat);
      const lng = parseFloat(c.bin_lon);
      return {
        id: key,
        label,
        geofence_name: geofenceName,
        city: meta.city || null,
        lat,
        lng,
        visit_count: parseInt(c.visit_count),
        last_visit: c.last_visited_at || null,
        first_visit: meta.first_visit || null,
        avg_distance: meta.avg_distance != null ? parseFloat(parseFloat(meta.avg_distance).toFixed(1)) : 0,
        avg_duration: meta.avg_duration != null ? Math.round(parseFloat(meta.avg_duration)) : 0,
        origins: originMap[key] || [],
      };
    });

    const pinned = [];
    const normal = [];
    for (const p of allPlaces) {
      if (p.geofence_name && PINNED_GEOFENCE_NAMES.includes(p.geofence_name)) {
        pinned.push(p);
      } else {
        normal.push(p);
      }
    }
    pinned.sort((a, b) =>
      PINNED_GEOFENCE_NAMES.indexOf(a.geofence_name) -
      PINNED_GEOFENCE_NAMES.indexOf(b.geofence_name)
    );

    return { places: [...normal, ...pinned] };
    }, { force }));
  } catch (err) {
    console.error('/api/frequent-places error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
