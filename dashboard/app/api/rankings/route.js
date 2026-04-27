import pool from '@/lib/db';
import { KWH_PER_KM } from '@/lib/constants';
import { batchReverseGeocode } from '@/lib/kakao-geo';

export const dynamic = 'force-dynamic';

// GET /api/rankings?type=drive_distance|drive_duration|drive_avg_speed|drive_eff|day_distance|day_duration|day_avg_speed|day_eff&limit=50
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'drive_distance';
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '30', 10)));

    const carResult = await pool.query(`SELECT id FROM cars LIMIT 1`);
    if (carResult.rows.length === 0) {
      return Response.json({ error: 'No car found' }, { status: 404 });
    }
    const carId = carResult.rows[0].id;

    if (type === 'drive_distance' || type === 'drive_duration' || type === 'drive_avg_speed' || type === 'drive_eff') {
      // 단일 주행 기준 정렬 컬럼
      // 평균속도: distance/duration*60, 지나치게 짧은 주행은 이상치이므로 distance >= 10km 필터
      // 효율: (used_km * KWH_PER_KM) / distance * 1000, range 데이터 누락/회생 우세는 제외, 짧은 주행은 노이즈 큼 → distance >= 10km
      let orderExpr, extraWhere = '', orderDir = 'DESC';
      if (type === 'drive_distance') orderExpr = 'd.distance';
      else if (type === 'drive_duration') orderExpr = 'd.duration_min';
      else if (type === 'drive_avg_speed') {
        orderExpr = 'd.distance / NULLIF(d.duration_min, 0) * 60';
        extraWhere = ' AND d.distance >= 10 AND d.duration_min > 0';
      } else {
        orderExpr = `(d.start_rated_range_km - d.end_rated_range_km) * ${KWH_PER_KM} / NULLIF(d.distance, 0) * 1000`;
        extraWhere = ' AND d.distance >= 10 AND d.start_rated_range_km IS NOT NULL AND d.end_rated_range_km IS NOT NULL AND (d.start_rated_range_km - d.end_rated_range_km) > 0';
        orderDir = 'ASC';
      }

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
         WHERE d.car_id = $1 AND (${orderExpr}) IS NOT NULL${extraWhere}
         ORDER BY (${orderExpr}) ${orderDir} NULLS LAST
         LIMIT $2`,
        [carId, limit]
      );

      const drives = rows.rows;
      const startCoords = drives.map(d => ({ lat: d.start_lat ? parseFloat(d.start_lat) : null, lng: d.start_lng ? parseFloat(d.start_lng) : null }));
      const endCoords   = drives.map(d => ({ lat: d.end_lat   ? parseFloat(d.end_lat)   : null, lng: d.end_lng   ? parseFloat(d.end_lng)   : null }));
      const [kakaoStarts, kakaoEnds] = await Promise.all([
        batchReverseGeocode(startCoords),
        batchReverseGeocode(endCoords),
      ]);

      return Response.json({
        type,
        items: drives.map((d, i) => {
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
      });
    }

    if (type === 'day_distance' || type === 'day_duration' || type === 'day_avg_speed' || type === 'day_eff') {
      // 정렬 기준: 일 평균속도는 SUM(distance)/SUM(duration_min)*60
      // 일 평균속도/효율은 짧은 주행만 있는 날은 이상치 유발 → distance >= 10km 필터
      // 일 효율: SUM(used_km) * KWH_PER_KM / SUM(distance) * 1000, ASC (낮을수록 효율 좋음)
      const usedKmExpr = `SUM(CASE WHEN start_rated_range_km IS NOT NULL AND end_rated_range_km IS NOT NULL THEN (start_rated_range_km - end_rated_range_km) ELSE 0 END)`;
      let orderExpr, havingExpr, orderDir = 'DESC';
      if (type === 'day_distance') {
        orderExpr = 'SUM(distance)';
        havingExpr = 'SUM(distance) > 0';
      } else if (type === 'day_duration') {
        orderExpr = 'SUM(duration_min)';
        havingExpr = 'SUM(duration_min) > 0';
      } else if (type === 'day_avg_speed') {
        orderExpr = 'SUM(distance) / NULLIF(SUM(duration_min), 0) * 60';
        havingExpr = 'SUM(distance) >= 10 AND SUM(duration_min) > 0';
      } else {
        orderExpr = `${usedKmExpr} * ${KWH_PER_KM} / NULLIF(SUM(distance), 0) * 1000`;
        havingExpr = `SUM(distance) >= 10 AND ${usedKmExpr} > 0`;
        orderDir = 'ASC';
      }

      const rows = await pool.query(
        `SELECT DATE(start_date + INTERVAL '9 hours')::text AS day,
                COALESCE(SUM(distance), 0)::float AS total_distance,
                COALESCE(SUM(duration_min), 0)::int AS total_duration,
                COALESCE(${usedKmExpr}, 0)::float AS total_range_used,
                COUNT(*)::int AS drive_count
         FROM drives
         WHERE car_id = $1
         GROUP BY day
         HAVING ${havingExpr}
         ORDER BY ${orderExpr} ${orderDir}
         LIMIT $2`,
        [carId, limit]
      );

      return Response.json({
        type,
        items: rows.rows.map(r => {
          const dist = parseFloat(r.total_distance.toFixed(1));
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
      });
    }

    return Response.json({ error: 'Invalid type' }, { status: 400 });
  } catch (err) {
    console.error('/api/rankings error:', err);
    return Response.json({ error: 'DB error' }, { status: 500 });
  }
}
