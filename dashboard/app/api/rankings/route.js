import pool from '@/lib/db';
import { batchReverseGeocode } from '@/lib/kakao-geo';

export const dynamic = 'force-dynamic';

// GET /api/rankings?type=drive_distance|drive_duration|day_distance|day_duration&limit=50
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

    if (type === 'drive_distance' || type === 'drive_duration') {
      const orderCol = type === 'drive_distance' ? 'd.distance' : 'd.duration_min';
      const rows = await pool.query(
        `SELECT d.id, d.start_date, d.end_date, d.distance, d.duration_min,
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
         WHERE d.car_id = $1 AND ${orderCol} IS NOT NULL
         ORDER BY ${orderCol} DESC NULLS LAST
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
        items: drives.map((d, i) => ({
          id: d.id,
          start_date: d.start_date,
          end_date: d.end_date,
          distance: d.distance ? parseFloat(parseFloat(d.distance).toFixed(1)) : 0,
          duration_min: d.duration_min ? Math.round(parseFloat(d.duration_min)) : null,
          start_address: d.start_geofence_name || kakaoStarts[i] || d.start_osm || null,
          end_address:   d.end_geofence_name   || kakaoEnds[i]   || d.end_osm   || null,
        })),
      });
    }

    if (type === 'day_distance' || type === 'day_duration') {
      const sumCol = type === 'day_distance' ? 'SUM(distance)' : 'SUM(duration_min)';
      const rows = await pool.query(
        `SELECT DATE(start_date + INTERVAL '9 hours')::text AS day,
                COALESCE(SUM(distance), 0)::float AS total_distance,
                COALESCE(SUM(duration_min), 0)::int AS total_duration,
                COUNT(*)::int AS drive_count
         FROM drives
         WHERE car_id = $1
         GROUP BY day
         HAVING ${sumCol} > 0
         ORDER BY ${sumCol} DESC
         LIMIT $2`,
        [carId, limit]
      );

      return Response.json({
        type,
        items: rows.rows.map(r => ({
          day: r.day,
          total_distance: parseFloat(r.total_distance.toFixed(1)),
          total_duration: r.total_duration,
          drive_count: r.drive_count,
        })),
      });
    }

    return Response.json({ error: 'Invalid type' }, { status: 400 });
  } catch (err) {
    console.error('/api/rankings error:', err);
    return Response.json({ error: 'DB error' }, { status: 500 });
  }
}
