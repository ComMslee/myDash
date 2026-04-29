import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';

export const dynamic = 'force-dynamic';

export async function GET() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  try {
    const car = await getDefaultCar();
    if (!car) {
      return Response.json({ positions: [] });
    }
    const carId = car.id;

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

    return Response.json({
      positions: posResult.rows.map(p => [
        parseFloat(p.latitude),
        parseFloat(p.longitude),
        1,
      ]),
    });
  } catch (err) {
    console.error('/api/heatmap error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
