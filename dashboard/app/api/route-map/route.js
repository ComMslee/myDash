import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get('driveId');
    let driveId = null;
    if (raw != null && raw !== '') {
      const parsed = parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return Response.json({ error: '유효하지 않은 driveId' }, { status: 400 });
      }
      driveId = parsed;
    }

    if (driveId == null) {
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

    // 속도 통계 단일 패스 (spread Math.max 스택오버플로 회피)
    let total = 0, maxSpeed = -Infinity;
    let jam = 0, slow = 0, flow = 0, fast = 0;
    for (const p of posResult.rows) {
      if (p.speed == null) continue;
      const v = parseFloat(p.speed);
      if (!Number.isFinite(v)) continue;
      total++;
      if (v > maxSpeed) maxSpeed = v;
      if (v <= 30) jam++;
      else if (v <= 60) slow++;
      else if (v <= 80) flow++;
      else fast++;
    }
    const maxSpeedKmh = total > 0 ? Math.round(maxSpeed) : null;
    const speedBands = total > 0 ? {
      jam:  Math.round(jam  / total * 100),
      slow: Math.round(slow / total * 100),
      flow: Math.round(flow / total * 100),
      fast: Math.round(fast / total * 100),
    } : null;

    return Response.json({
      driveId,
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
    return Response.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
