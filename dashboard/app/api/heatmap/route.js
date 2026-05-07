import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const carResult = await pool.query(`SELECT id FROM cars LIMIT 1`);
    if (carResult.rows.length === 0) {
      return Response.json({ positions: [] });
    }
    const carId = carResult.rows[0].id;

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
