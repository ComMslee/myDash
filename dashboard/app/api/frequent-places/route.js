import pool from '@/lib/db';
import { batchReverseGeocode } from '@/lib/kakao-geo';

export const dynamic = 'force-dynamic';

// 지오펜스 이름이 아래와 일치하면 "자주 가는 곳" 목록에서 분리해 상단 pin으로 표시
const PINNED_GEOFENCE_NAMES = ['집', '회사', 'Home', 'Work'];

export async function GET() {
  try {
    const carResult = await pool.query(`SELECT id FROM cars LIMIT 1`);
    if (carResult.rows.length === 0) {
      return Response.json({ places: [] });
    }
    const carId = carResult.rows[0].id;

    // 좌표 0.0005° bin (~55m)로 그룹핑, Kakao 질의는 그룹 내 실좌표 평균 사용
    const result = await pool.query(
      `SELECT * FROM (
         SELECT
           FLOOR(COALESCE(g.latitude, a.latitude)::numeric * 2000)::text || ',' ||
           FLOOR(COALESCE(g.longitude, a.longitude)::numeric * 2000)::text AS place_key,
           AVG(COALESCE(g.latitude, a.latitude))::float AS place_lat,
           AVG(COALESCE(g.longitude, a.longitude))::float AS place_lng,
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
           FLOOR(COALESCE(g.latitude, a.latitude)::numeric * 2000),
           FLOOR(COALESCE(g.longitude, a.longitude)::numeric * 2000)
       ) sub
       ORDER BY visit_count DESC
       LIMIT 100`,
      [carId]
    );

    // 주요 출발지 TOP3 per place (좌표 반올림 기준)
    const placeKeys = result.rows.map(p => p.place_key);
    let originMap = {};
    if (placeKeys.length > 0) {
      const originResult = await pool.query(
        `SELECT place_key, start_label, start_geofence_name, start_lat, start_lng, cnt FROM (
           SELECT
             FLOOR(COALESCE(eg.latitude, ea.latitude)::numeric * 2000)::text || ',' ||
             FLOOR(COALESCE(eg.longitude, ea.longitude)::numeric * 2000)::text AS place_key,
             COALESCE(sg.name, NULLIF(TRIM(CONCAT_WS(' ', sa.road, sa.house_number)), '')) AS start_label,
             sg.name AS start_geofence_name,
             AVG(COALESCE(sg.latitude, sa.latitude))::float AS start_lat,
             AVG(COALESCE(sg.longitude, sa.longitude))::float AS start_lng,
             COUNT(*) AS cnt,
             ROW_NUMBER() OVER (
               PARTITION BY
                 FLOOR(COALESCE(eg.latitude, ea.latitude)::numeric * 2000)::text || ',' ||
                 FLOOR(COALESCE(eg.longitude, ea.longitude)::numeric * 2000)::text
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
             FLOOR(COALESCE(eg.latitude, ea.latitude)::numeric * 2000)::text || ',' ||
             FLOOR(COALESCE(eg.longitude, ea.longitude)::numeric * 2000)::text,
             COALESCE(sg.name, NULLIF(TRIM(CONCAT_WS(' ', sa.road, sa.house_number)), '')),
             sg.name
         ) sub WHERE rn <= 3`,
        [carId]
      );

      // 지오펜스 이름이 없는 출발지들만 모아서 Kakao 한국어 주소로 일괄 변환
      const originRows = originResult.rows;
      const originCoords = originRows.map(r => ({
        lat: !r.start_geofence_name && r.start_lat ? parseFloat(r.start_lat) : null,
        lng: !r.start_geofence_name && r.start_lng ? parseFloat(r.start_lng) : null,
      }));
      const originKakaoLabels = await batchReverseGeocode(originCoords);

      for (let i = 0; i < originRows.length; i++) {
        const row = originRows[i];
        // 지오펜스 이름 > Kakao 한국어 주소 > OSM fallback
        const label = row.start_geofence_name || originKakaoLabels[i] || row.start_label;
        if (!originMap[row.place_key]) originMap[row.place_key] = [];
        originMap[row.place_key].push({ label, count: parseInt(row.cnt) });
      }
    }

    // Kakao 역지오코딩 — 지오펜스 이름이 없는 장소에만 적용
    const coords = result.rows.map(p => ({
      lat: p.place_lat ? parseFloat(p.place_lat) : null,
      lng: p.place_lng ? parseFloat(p.place_lng) : null,
    }));
    const kakaoLabels = await batchReverseGeocode(coords);

    const allPlaces = result.rows.map((p, i) => {
      // 지오펜스 이름 > Kakao 한국어 주소 > DB 영어 주소 > 기본값
      const geofenceName = p.geofence_name || null;
      const kakaoLabel = kakaoLabels[i] || null;
      const dbLabel = p.label || null;
      const label = geofenceName || kakaoLabel || dbLabel || '알 수 없는 장소';
      return {
        id: p.place_key,
        label,
        geofence_name: geofenceName,
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
    });

    // 집/회사 지오펜스는 목록 맨 뒤로 이동 (visit_count가 커도 상위 노출 방지)
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

    return Response.json({ places: [...normal, ...pinned] });
  } catch (err) {
    console.error('/api/frequent-places error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
