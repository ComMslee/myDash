import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    let driveId = searchParams.get('driveId');

    if (!driveId) {
      // Get the last drive
      const carResult = await pool.query(`SELECT id FROM cars LIMIT 1`);
      if (carResult.rows.length === 0) {
        return Response.json({ positions: [] });
      }
      const carId = carResult.rows[0].id;

      const lastDrive = await pool.query(
        `SELECT id FROM drives WHERE car_id = $1 ORDER BY start_date DESC LIMIT 1`,
        [carId]
      );
      if (lastDrive.rows.length === 0) {
        return Response.json({ positions: [], driveId: null });
      }
      driveId = lastDrive.rows[0].id;
    }

    const posResult = await pool.query(
      `SELECT latitude, longitude, date, speed
       FROM positions
       WHERE drive_id = $1
       ORDER BY date ASC`,
      [driveId]
    );

    return Response.json({
      driveId: parseInt(driveId),
      positions: posResult.rows.map(p => ({
        lat: parseFloat(p.latitude),
        lng: parseFloat(p.longitude),
        date: p.date,
        speed: p.speed != null ? Math.round(parseFloat(p.speed)) : null,
      })),
    });
  } catch (err) {
    console.error('/api/route-map error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
