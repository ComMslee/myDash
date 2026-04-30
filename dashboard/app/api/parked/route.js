import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';

export const dynamic = 'force-dynamic';

// 마지막 종료된 drive 의 위치·시간. 진행 중 drive 가 있으면 driving=true.

export async function GET() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  try {
    const car = await getDefaultCar();
    if (!car) return Response.json({ error: 'No car found' }, { status: 404 });

    const { rows: open } = await pool.query(
      `SELECT start_date FROM drives
       WHERE car_id = $1 AND end_date IS NULL
       ORDER BY start_date DESC LIMIT 1`,
      [car.id],
    );
    if (open.length) {
      return Response.json({ driving: true, drive_started_at: open[0].start_date, parked: null });
    }

    const { rows } = await pool.query(
      `SELECT d.end_date,
              eg.name AS geofence_name,
              NULLIF(TRIM(CONCAT_WS(' ', ea.road, ea.house_number)), '') AS osm,
              ep.latitude::float AS lat, ep.longitude::float AS lng
       FROM drives d
       LEFT JOIN addresses ea ON ea.id = d.end_address_id
       LEFT JOIN geofences eg ON eg.id = d.end_geofence_id
       LEFT JOIN positions ep ON ep.id = d.end_position_id
       WHERE d.car_id = $1 AND d.end_date IS NOT NULL
       ORDER BY d.end_date DESC LIMIT 1`,
      [car.id],
    );
    if (!rows.length) return Response.json({ driving: false, parked: null });

    const r = rows[0];
    const place = r.geofence_name || r.osm
      || (r.lat != null ? `${Number(r.lat).toFixed(5)}, ${Number(r.lng).toFixed(5)}` : null);
    const elapsed_min = Math.floor((Date.now() - new Date(r.end_date).getTime()) / 60000);
    return Response.json({
      driving: false,
      parked: {
        end_date: r.end_date,
        place,
        lat: r.lat != null ? Number(r.lat) : null,
        lng: r.lng != null ? Number(r.lng) : null,
        elapsed_min,
      },
    });
  } catch (e) {
    console.error('/api/parked error:', e);
    return Response.json({ error: 'DB error', detail: e.message }, { status: 500 });
  }
}
