import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';

export const dynamic = 'force-dynamic';

// 차량의 가장 최근 좌표 — 봇 /where 공용. 지도 핀/링크용 단순 응답.

export async function GET() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  try {
    const car = await getDefaultCar();
    if (!car) return Response.json({ error: 'No car found' }, { status: 404 });

    const { rows } = await pool.query(
      `SELECT latitude::float AS lat, longitude::float AS lng, date
       FROM positions WHERE car_id = $1 ORDER BY date DESC LIMIT 1`,
      [car.id],
    );
    const p = rows[0];
    if (!p) return Response.json({ lat: null, lng: null, date: null });
    return Response.json({ lat: p.lat, lng: p.lng, date: p.date });
  } catch (e) {
    console.error('/api/location error:', e);
    return Response.json({ error: 'DB error', detail: e.message }, { status: 500 });
  }
}
