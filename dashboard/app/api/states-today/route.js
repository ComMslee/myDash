import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';

export const dynamic = 'force-dynamic';

// 오늘(KST) state 전환 타임라인 — TeslaMate states 테이블.
// online/asleep/offline/driving/charging 행을 KST 자정~now 로 클리핑해서 반환.
export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  try {
    const car = await getDefaultCar();
    if (!car) return Response.json({ error: 'No car' }, { status: 404 });

    const { rows } = await pool.query(
      `WITH bounds AS (
         SELECT (DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul') AS day_start
       )
       SELECT
         state,
         GREATEST(start_date, (SELECT day_start FROM bounds)) AS seg_start,
         LEAST(COALESCE(end_date, NOW()), NOW()) AS seg_end,
         (end_date IS NULL) AS is_current
       FROM states
       WHERE car_id = $1
         AND COALESCE(end_date, NOW()) > (SELECT day_start FROM bounds)
       ORDER BY start_date ASC`,
      [car.id],
    );

    const segments = rows.map(r => {
      const startMs = new Date(r.seg_start).getTime();
      const endMs = new Date(r.seg_end).getTime();
      return {
        state: r.state,
        start: r.seg_start,
        end: r.seg_end,
        minutes: Math.max(0, Math.round((endMs - startMs) / 60000)),
        is_current: r.is_current,
      };
    });

    return Response.json({ segments });
  } catch (e) {
    console.error('/api/states-today error:', e);
    return Response.json({ error: 'DB error' }, { status: 500 });
  }
}
