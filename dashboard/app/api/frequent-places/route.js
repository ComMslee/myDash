import pool from '@/lib/db';
import { batchReverseGeocode } from '@/lib/kakao-geo';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const carResult = await pool.query(`SELECT id FROM cars LIMIT 1`);
    if (carResult.rows.length === 0) {
      return Response.json({ places: [] });
    }
    const carId = carResult.rows[0].id;

    // 좌표 3자리 반올림으로 그룹핑 (~110m 반경), 이름은 그룹 내 최빈값
    const result = await pool.query(
      `SELECT * FROM (
         SELECT
           ROUND(COALESCE(g.latitude, a.latitude)::numeric, 3)::text || ',' ||
           ROUND(COALESCE(g.longitude, a.longitude)::numeric, 3)::text AS place_key,
           ROUND(COALESCE(g.latitude, a.latitude)::numeric, 3)::float AS place_lat,
           ROUND(COALESCE(g.longitude, a.longitude)::numeric, 3)::float AS place_lng,
           MODE() WITHIN GROUP (ORDER BY COALESCE(g.name, NULLIF(TRIM(CONCAT_WS(' ', a.road, a.house_number)), ''))) AS label,
           MODE() WITHIN GROUP (ORDER BY g.name) FILTER (WHERE g.name IS NOT NULL) AS geofence_name,
           MODE() WITHIN GROUP (ORDER BY a.city) AS city,
           COUNT(*) AS visit_count,
           MAX(d.start_date) AS last_visit,
           MIN(d.start_date) AS first_visit,
           COALESCE(AVG(d.distance), 0)::float AS avg_distance,
           COALESCE(AVG(d.duration_min), 0)::float AS avg_duration
         FROM drives d
         LEFT JOIN geofences g ON g.id = d.end_geofence_id
         LEFT JOIN addresses a ON a.id = d.end_address_id
         WHERE d.car_id = $1
           AND (d.end_geofence_id IS NOT NULL OR d.end_address_id IS NOT NULL)
           AND COALESCE(g.latitude, a.latitude) IS NOT NULL
         GROUP BY
           ROUND(COALESCE(g.latitude, a.latitude)::numeric, 3),
           ROUND(COALESCE(g.longitude, a.longitude)::numeric, 3)
       ) sub
       ORDER BY visit_count DESC
       LIMIT 12`,
      [carId]
    );

    // 주요 출발지 TOP3 per place (좌표 반올림 기준)
    const placeKeys = result.rows.map(p => p.place_key);
    let originMap = {};
    if (placeKeys.length > 0) {
      const originResult = await pool.query(
        `SELECT place_key, start_label, cnt FROM (
           SELECT
             ROUND(COALESCE(eg.latitude, ea.latitude)::numeric, 3)::text || ',' ||
             ROUND(COALESCE(eg.longitude, ea.longitude)::numeric, 3)::text AS place_key,
             COALESCE(sg.name, NULLIF(TRIM(CONCAT_WS(' ', sa.road, sa.house_number)), '')) AS start_label,
             COUNT(*) AS cnt,
             ROW_NUMBER() OVER (
               PARTITION BY
                 ROUND(COALESCE(eg.latitude, ea.latitude)::numeric, 3)::text || ',' ||
                 ROUND(COALESCE(eg.longitude, ea.longitude)::numeric, 3)::text
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
             ROUND(COALESCE(eg.latitude, ea.latitude)::numeric, 3)::text || ',' ||
             ROUND(COALESCE(eg.longitude, ea.longitude)::numeric, 3)::text,
             COALESCE(sg.name, NULLIF(TRIM(CONCAT_WS(' ', sa.road, sa.house_number)), ''))
         ) sub WHERE rn <= 3`,
        [carId]
      );
      for (const row of originResult.rows) {
        if (!originMap[row.place_key]) originMap[row.place_key] = [];
        originMap[row.place_key].push({ label: row.start_label, count: parseInt(row.cnt) });
      }
    }

    // Kakao 역지오코딩 — 지오펜스 이름이 없는 장소에만 적용
    const coords = result.rows.map(p => ({
      lat: p.place_lat ? parseFloat(p.place_lat) : null,
      lng: p.place_lng ? parseFloat(p.place_lng) : null,
    }));
    const kakaoLabels = await batchReverseGeocode(coords);

    return Response.json({
      places: result.rows.map((p, i) => {
        // 지오펜스 이름 > Kakao 한국어 주소 > DB 영어 주소 > 기본값
        const geofenceName = p.geofence_name || null;
        const kakaoLabel = kakaoLabels[i] || null;
        const dbLabel = p.label || null;
        const label = geofenceName || kakaoLabel || dbLabel || '알 수 없는 장소';
        return {
          id: p.place_key,
          label,
          city: p.city || null,
          lat: p.place_lat ? parseFloat(p.place_lat) : null,
          lng: p.place_lng ? parseFloat(p.place_lng) : null,
          visit_count: parseInt(p.visit_count),
          last_visit: p.last_visit || null,
          first_visit: p.first_visit || null,
          avg_distance: parseFloat(p.avg_distance.toFixed(1)),
          avg_duration: Math.round(p.avg_duration),
          origins: originMap[p.place_key] || [],
        };
      }),
    });
  } catch (err) {
    console.error('/api/frequent-places error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
