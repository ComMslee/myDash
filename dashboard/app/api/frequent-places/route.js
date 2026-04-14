import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const carResult = await pool.query(`SELECT id FROM cars LIMIT 1`);
    if (carResult.rows.length === 0) {
      return Response.json({ places: [] });
    }
    const carId = carResult.rows[0].id;

    const result = await pool.query(
      `SELECT a.id,
              COALESCE(a.name, a.road, a.display_name) AS label,
              a.city,
              a.latitude,
              a.longitude,
              COUNT(*) AS visit_count
       FROM drives d
       JOIN addresses a ON a.id = d.end_address_id
       WHERE d.car_id = $1 AND d.end_address_id IS NOT NULL
       GROUP BY a.id, a.name, a.road, a.display_name, a.city, a.latitude, a.longitude
       ORDER BY visit_count DESC
       LIMIT 12`,
      [carId]
    );

    return Response.json({
      places: result.rows.map(p => ({
        id: p.id,
        label: p.label || '알 수 없는 장소',
        city: p.city || null,
        lat: p.latitude ? parseFloat(p.latitude) : null,
        lng: p.longitude ? parseFloat(p.longitude) : null,
        visit_count: parseInt(p.visit_count),
      })),
    });
  } catch (err) {
    console.error('/api/frequent-places error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
