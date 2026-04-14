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
              COUNT(*) AS visit_count,
              MAX(d.start_date) AS last_visit,
              MIN(d.start_date) AS first_visit,
              COALESCE(AVG(d.distance), 0)::float AS avg_distance,
              COALESCE(AVG(d.duration_min), 0)::float AS avg_duration
       FROM drives d
       JOIN addresses a ON a.id = d.end_address_id
       WHERE d.car_id = $1 AND d.end_address_id IS NOT NULL
       GROUP BY a.id, a.name, a.road, a.display_name, a.city, a.latitude, a.longitude
       ORDER BY visit_count DESC
       LIMIT 12`,
      [carId]
    );

    // 주요 출발지 TOP2 per place
    const placeIds = result.rows.map(p => p.id);
    let originMap = {};
    if (placeIds.length > 0) {
      const originResult = await pool.query(
        `SELECT end_addr, start_label, cnt FROM (
           SELECT d.end_address_id AS end_addr,
                  COALESCE(sa.name, sa.road, sa.display_name) AS start_label,
                  COUNT(*) AS cnt,
                  ROW_NUMBER() OVER (PARTITION BY d.end_address_id ORDER BY COUNT(*) DESC) AS rn
           FROM drives d
           JOIN addresses sa ON sa.id = d.start_address_id
           WHERE d.car_id = $1 AND d.end_address_id = ANY($2)
           GROUP BY d.end_address_id, sa.name, sa.road, sa.display_name
         ) sub WHERE rn <= 2`,
        [carId, placeIds]
      );
      for (const row of originResult.rows) {
        if (!originMap[row.end_addr]) originMap[row.end_addr] = [];
        originMap[row.end_addr].push({ label: row.start_label, count: parseInt(row.cnt) });
      }
    }

    return Response.json({
      places: result.rows.map(p => ({
        id: p.id,
        label: p.label || '알 수 없는 장소',
        city: p.city || null,
        lat: p.latitude ? parseFloat(p.latitude) : null,
        lng: p.longitude ? parseFloat(p.longitude) : null,
        visit_count: parseInt(p.visit_count),
        last_visit: p.last_visit || null,
        first_visit: p.first_visit || null,
        avg_distance: parseFloat(p.avg_distance.toFixed(1)),
        avg_duration: Math.round(p.avg_duration),
        origins: originMap[p.id] || [],
      })),
    });
  } catch (err) {
    console.error('/api/frequent-places error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
