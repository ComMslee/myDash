import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';
import { batchReverseGeocode } from '@/lib/kakao-geo';
import { withCache } from '@/lib/server-cache';
import { TTL_300S } from '@/lib/cache-ttls';

export const dynamic = 'force-dynamic';

// 단발 정차(신호/잠깐 하차) 노이즈 제거 — 10분 미만은 dwell 으로 카운트 안 함.
const MIN_DWELL_SEC = 600;

// 집/회사 지오펜스는 맨 뒤로 (자주 가는 곳과 동일 — 일상적으로 가장 오래 머물러
// 압도하지만 정보로서 가치 낮음, 그 외 장소 가시성 우선)
const PINNED_GEOFENCE_NAMES = ['집', '회사', 'Home', 'Work'];

// 오래 머문 곳 — drives 의 종료 시각과 다음 drives 의 시작 시각 간 갭을 dwell 로 산출.
// LEAD 윈도우 함수로 다음 주행 start_date 끌어오고, 마지막 주행은 NOW() 로 대체해
// 현재 진행 중인 체류도 포함. 좌표 0.0005° bin(~55m) 단위로 그룹핑(자주가는곳과 동일).
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

    return Response.json(await withCache(`long-stay-places:${carId}`, TTL_300S, async () => {

    const result = await pool.query(
      `WITH dwells AS (
         SELECT
           d.car_id,
           d.start_date,
           d.end_date,
           d.end_geofence_id,
           d.end_address_id,
           EXTRACT(EPOCH FROM (
             COALESCE(LEAD(d.start_date) OVER (PARTITION BY d.car_id ORDER BY d.start_date), NOW())
             - d.end_date
           )) AS dwell_sec
         FROM drives d
         WHERE d.car_id = $1 AND d.end_date IS NOT NULL
       )
       SELECT * FROM (
         SELECT
           FLOOR(COALESCE(g.latitude, a.latitude)::numeric * 2000)::text || ',' ||
           FLOOR(COALESCE(g.longitude, a.longitude)::numeric * 2000)::text AS place_key,
           AVG(COALESCE(g.latitude, a.latitude))::float AS place_lat,
           AVG(COALESCE(g.longitude, a.longitude))::float AS place_lng,
           MODE() WITHIN GROUP (ORDER BY COALESCE(g.name, NULLIF(TRIM(CONCAT_WS(' ', a.road, a.house_number)), ''))) AS label,
           MODE() WITHIN GROUP (ORDER BY g.name) FILTER (WHERE g.name IS NOT NULL) AS geofence_name,
           MODE() WITHIN GROUP (ORDER BY a.city) AS city,
           SUM(dw.dwell_sec)::float AS total_dwell_sec,
           AVG(dw.dwell_sec)::float AS avg_dwell_sec,
           MAX(dw.dwell_sec)::float AS max_dwell_sec,
           MIN(dw.dwell_sec)::float AS min_dwell_sec,
           COUNT(*)::int AS visit_count,
           MAX(dw.end_date) AS last_visit,
           MIN(dw.end_date) AS first_visit
         FROM dwells dw
         LEFT JOIN geofences g ON g.id = dw.end_geofence_id
         LEFT JOIN addresses a ON a.id = dw.end_address_id
         WHERE dw.dwell_sec > $2
           AND (dw.end_geofence_id IS NOT NULL OR dw.end_address_id IS NOT NULL)
           AND COALESCE(g.latitude, a.latitude) IS NOT NULL
         GROUP BY
           FLOOR(COALESCE(g.latitude, a.latitude)::numeric * 2000),
           FLOOR(COALESCE(g.longitude, a.longitude)::numeric * 2000)
       ) sub
       ORDER BY max_dwell_sec DESC
       LIMIT 100`,
      [carId, MIN_DWELL_SEC]
    );

    // Kakao 역지오코딩 — 지오펜스 이름이 없는 장소에만
    const coords = result.rows.map(p => ({
      lat: p.place_lat ? parseFloat(p.place_lat) : null,
      lng: p.place_lng ? parseFloat(p.place_lng) : null,
    }));
    const kakaoLabels = await batchReverseGeocode(coords);

    const allPlaces = result.rows.map((p, i) => {
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
        total_dwell_sec: Math.round(p.total_dwell_sec),
        avg_dwell_sec: Math.round(p.avg_dwell_sec),
        max_dwell_sec: Math.round(p.max_dwell_sec),
        min_dwell_sec: Math.round(p.min_dwell_sec),
        visit_count: p.visit_count,
        last_visit: p.last_visit || null,
        first_visit: p.first_visit || null,
      };
    });

    // 집/회사 핀 → 맨 뒤로 (자주 가는 곳과 동일 처리)
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

    return { places: [...normal, ...pinned], min_dwell_sec: MIN_DWELL_SEC };
    }, { force }));
  } catch (err) {
    console.error('/api/long-stay-places error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
