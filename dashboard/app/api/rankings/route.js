import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';
import { KWH_PER_KM } from '@/lib/constants';
import { batchReverseGeocode } from '@/lib/kakao-geo';
import { withCache } from '@/lib/server-cache';
import { ensureSchema, bootstrapIfEmpty } from '@/lib/dash-agg';

export const dynamic = 'force-dynamic';

// GET /api/rankings?type=drive_distance|drive_duration|drive_avg_speed|drive_eff|day_distance|day_duration|day_avg_speed|day_eff&limit=50
export async function GET(request) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const force = new URL(request.url).searchParams.get('refresh') === '1';
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'drive_distance';
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '30', 10)));

    const car = await getDefaultCar();
    if (!car) {
      return Response.json({ error: 'No car found' }, { status: 404 });
    }
    const carId = car.id;

    const validTypes = ['drive_distance','drive_duration','drive_avg_speed','drive_eff','day_distance','day_duration','day_avg_speed','day_eff'];
    if (!validTypes.includes(type)) return Response.json({ error: 'Invalid type' }, { status: 400 });

    await ensureSchema();
    await bootstrapIfEmpty(carId);

    return Response.json(await withCache(`rankings:${carId}:${type}:${limit}`, 300_000, async () => {

    if (type === 'drive_distance' || type === 'drive_duration' || type === 'drive_avg_speed' || type === 'drive_eff') {
      // dash_top_drives_cache 에서 TOP-N drive_id 추출 후 drives 메타 JOIN
      const top = await pool.query(
        `SELECT drive_id, value, start_date
           FROM dash_top_drives_cache
          WHERE car_id = $1 AND metric = $2 AND drive_id IS NOT NULL
          ORDER BY rank ASC
          LIMIT $3`,
        [carId, type, limit]
      );
      if (top.rows.length === 0) {
        return { type, items: [] };
      }
      const ids = top.rows.map(r => r.drive_id);
      const rows = await pool.query(
        `SELECT d.id, d.start_date, d.end_date, d.distance, d.duration_min,
                d.start_rated_range_km, d.end_rated_range_km,
                sp.latitude AS start_lat, sp.longitude AS start_lng,
                ep.latitude AS end_lat, ep.longitude AS end_lng,
                sg.name AS start_geofence_name,
                eg.name AS end_geofence_name,
                NULLIF(TRIM(CONCAT_WS(' ', sa.road, sa.house_number)), '') AS start_osm,
                NULLIF(TRIM(CONCAT_WS(' ', ea.road, ea.house_number)), '') AS end_osm
         FROM drives d
         LEFT JOIN addresses sa ON sa.id = d.start_address_id
         LEFT JOIN addresses ea ON ea.id = d.end_address_id
         LEFT JOIN geofences sg ON sg.id = d.start_geofence_id
         LEFT JOIN geofences eg ON eg.id = d.end_geofence_id
         LEFT JOIN positions sp ON sp.id = d.start_position_id
         LEFT JOIN positions ep ON ep.id = d.end_position_id
         WHERE d.id = ANY($1::bigint[])`,
        [ids]
      );
      // 캐시된 rank 순서대로 정렬
      const byId = new Map();
      for (const r of rows.rows) byId.set(String(r.id), r);
      const ordered = ids.map(id => byId.get(String(id))).filter(Boolean);

      const startCoords = ordered.map(d => ({ lat: d.start_lat ? parseFloat(d.start_lat) : null, lng: d.start_lng ? parseFloat(d.start_lng) : null }));
      const endCoords   = ordered.map(d => ({ lat: d.end_lat   ? parseFloat(d.end_lat)   : null, lng: d.end_lng   ? parseFloat(d.end_lng)   : null }));
      const [kakaoStarts, kakaoEnds] = await Promise.all([
        batchReverseGeocode(startCoords),
        batchReverseGeocode(endCoords),
      ]);

      return {
        type,
        items: ordered.map((d, i) => {
          const dist = d.distance ? parseFloat(parseFloat(d.distance).toFixed(1)) : 0;
          const dur  = d.duration_min ? Math.round(parseFloat(d.duration_min)) : null;
          const avgSpeed = dist > 0 && dur > 0 ? parseFloat((dist / dur * 60).toFixed(1)) : null;
          const sRange = d.start_rated_range_km != null ? parseFloat(d.start_rated_range_km) : null;
          const eRange = d.end_rated_range_km   != null ? parseFloat(d.end_rated_range_km)   : null;
          const usedKm = (sRange != null && eRange != null) ? (sRange - eRange) : null;
          const effWhKm = (usedKm != null && usedKm > 0 && dist > 0)
            ? Math.round(usedKm * KWH_PER_KM / dist * 1000)
            : null;
          return {
            id: d.id,
            start_date: d.start_date,
            end_date: d.end_date,
            distance: dist,
            duration_min: dur,
            avg_speed: avgSpeed,
            eff_wh_km: effWhKm,
            start_address: d.start_geofence_name || kakaoStarts[i] || d.start_osm || null,
            end_address:   d.end_geofence_name   || kakaoEnds[i]   || d.end_osm   || null,
          };
        }),
      };
    }

    if (type === 'day_distance' || type === 'day_duration' || type === 'day_avg_speed' || type === 'day_eff') {
      // dash_top_drives_cache 에 day 메트릭 캐시되어 있지만 day별 합계 메타가 필요해 drives 재조회.
      // 캐시된 start_date 의 KST date 값을 그대로 사용해 daily 합산.
      const top = await pool.query(
        `SELECT (start_date AT TIME ZONE 'UTC' + INTERVAL '9 hours')::date::text AS day, value
           FROM dash_top_drives_cache
          WHERE car_id = $1 AND metric = $2
          ORDER BY rank ASC
          LIMIT $3`,
        [carId, type, limit]
      );
      if (top.rows.length === 0) {
        return { type, items: [] };
      }
      const days = top.rows.map(r => r.day);
      const usedKmExpr = `SUM(CASE WHEN start_rated_range_km IS NOT NULL AND end_rated_range_km IS NOT NULL THEN (start_rated_range_km - end_rated_range_km) ELSE 0 END)`;
      const rows = await pool.query(
        `SELECT DATE(start_date + INTERVAL '9 hours')::text AS day,
                COALESCE(SUM(distance), 0)::float AS total_distance,
                COALESCE(SUM(duration_min), 0)::int AS total_duration,
                COALESCE(${usedKmExpr}, 0)::float AS total_range_used,
                COUNT(*)::int AS drive_count
         FROM drives
         WHERE car_id = $1
           AND DATE(start_date + INTERVAL '9 hours') = ANY($2::date[])
         GROUP BY day`,
        [carId, days]
      );
      const byDay = new Map();
      for (const r of rows.rows) byDay.set(r.day, r);
      const ordered = days.map(d => byDay.get(d)).filter(Boolean);

      return {
        type,
        items: ordered.map(r => {
          const dist = parseFloat(parseFloat(r.total_distance).toFixed(1));
          const dur  = r.total_duration;
          const avgSpeed = dist > 0 && dur > 0 ? parseFloat((dist / dur * 60).toFixed(1)) : null;
          const usedKm = parseFloat(r.total_range_used);
          const effWhKm = (usedKm > 0 && dist > 0) ? Math.round(usedKm * KWH_PER_KM / dist * 1000) : null;
          return {
            day: r.day,
            total_distance: dist,
            total_duration: dur,
            avg_speed: avgSpeed,
            eff_wh_km: effWhKm,
            drive_count: r.drive_count,
          };
        }),
      };
    }
    }, { force }));
  } catch (err) {
    console.error('/api/rankings error:', err);
    return Response.json({ error: 'DB error' }, { status: 500 });
  }
}
