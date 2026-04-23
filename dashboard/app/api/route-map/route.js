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
      `SELECT latitude, longitude, date, speed, elevation, outside_temp, inside_temp
       FROM positions
       WHERE drive_id = $1
       ORDER BY date ASC`,
      [driveId]
    );

    const validSpeeds = posResult.rows.filter(p => p.speed != null);
    const total = validSpeeds.length;
    const maxSpeedKmh = total > 0
      ? Math.round(Math.max(...validSpeeds.map(p => parseFloat(p.speed))))
      : null;

    // 4구간 퍼센트 (카카오/네이버 교통정보 기준)
    const speedBands = total > 0 ? {
      jam:   Math.round(validSpeeds.filter(p => parseFloat(p.speed) <= 30).length / total * 100),
      slow:  Math.round(validSpeeds.filter(p => parseFloat(p.speed) > 30 && parseFloat(p.speed) <= 60).length / total * 100),
      flow:  Math.round(validSpeeds.filter(p => parseFloat(p.speed) > 60 && parseFloat(p.speed) <= 80).length / total * 100),
      fast:  Math.round(validSpeeds.filter(p => parseFloat(p.speed) > 80).length / total * 100),
    } : null;

    return Response.json({
      driveId: parseInt(driveId),
      positions: posResult.rows.map(p => ({
        lat: parseFloat(p.latitude),
        lng: parseFloat(p.longitude),
        date: p.date,
        speed: p.speed != null ? Math.round(parseFloat(p.speed)) : null,
        elev: p.elevation != null ? parseFloat(p.elevation) : null,
        temp: p.outside_temp != null ? parseFloat(p.outside_temp) : null,
      })),
      maxSpeedKmh,
      speedBands,
    });
  } catch (err) {
    console.error('/api/route-map error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
