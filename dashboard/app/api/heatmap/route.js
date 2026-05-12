import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';
import { withCache } from '@/lib/server-cache';
import { TTL_300S } from '@/lib/cache-ttls';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const force = new URL(request.url).searchParams.get('refresh') === '1';
  try {
    const car = await getDefaultCar();
    if (!car) {
      return Response.json({ positions: [] });
    }
    const carId = car.id;

    return Response.json(await withCache(`heatmap:${carId}`, TTL_300S, async () => {
    const posResult = await pool.query(
      `SELECT latitude, longitude
       FROM positions
       WHERE car_id = $1
         AND latitude IS NOT NULL
         AND longitude IS NOT NULL
       ORDER BY date DESC
       LIMIT 5000`,
      [carId]
    );

    return {
      positions: posResult.rows.map(p => [
        parseFloat(p.latitude),
        parseFloat(p.longitude),
        1,
      ]),
    };
    }, { force }));
  } catch (err) {
    console.error('/api/heatmap error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
