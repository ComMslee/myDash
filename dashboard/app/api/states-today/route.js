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

    // TeslaMate states 는 online/asleep/offline 만 기록 — 주행·충전 중에도 state='online'.
    // 그래서 online 구간에서 drives/charging_processes 시간을 잘라내 "그냥 깬" 구간만 추출.
    const dayStartMs = (() => {
      const now = new Date();
      const kstMs = now.getTime() + 9 * 3600_000;
      const dayStartKst = Math.floor(kstMs / 86400_000) * 86400_000;
      return dayStartKst - 9 * 3600_000;
    })();
    const nowMs = Date.now();

    const [statesR, drivesR, chargesR] = await Promise.all([
      pool.query(
        `SELECT state, start_date, end_date
         FROM states
         WHERE car_id = $1 AND COALESCE(end_date, NOW()) > to_timestamp($2)
         ORDER BY start_date ASC`,
        [car.id, dayStartMs / 1000],
      ),
      pool.query(
        `SELECT start_date, end_date FROM drives
         WHERE car_id = $1 AND COALESCE(end_date, NOW()) > to_timestamp($2)`,
        [car.id, dayStartMs / 1000],
      ),
      pool.query(
        `SELECT start_date, end_date FROM charging_processes
         WHERE car_id = $1 AND COALESCE(end_date, NOW()) > to_timestamp($2)`,
        [car.id, dayStartMs / 1000],
      ),
    ]);

    const clip = (s, e) => [Math.max(s, dayStartMs), Math.min(e, nowMs)];
    const busy = [...drivesR.rows, ...chargesR.rows]
      .map(r => clip(new Date(r.start_date).getTime(), r.end_date ? new Date(r.end_date).getTime() : nowMs))
      .filter(([s, e]) => e > s)
      .sort((a, b) => a[0] - b[0]);

    // online 구간에서 busy 시간을 빼서 "그냥 깬" 서브구간 추출
    const segments = [];
    for (const row of statesR.rows) {
      const [s0, e0] = clip(new Date(row.start_date).getTime(), row.end_date ? new Date(row.end_date).getTime() : nowMs);
      if (e0 <= s0) continue;
      const isCurrent = row.end_date == null;
      if (row.state !== 'online') {
        segments.push({ state: row.state, start: new Date(s0).toISOString(), end: new Date(e0).toISOString(), minutes: Math.round((e0 - s0) / 60000), is_current: isCurrent });
        continue;
      }
      // online: busy 와 겹치는 부분 제거
      let cursor = s0;
      for (const [bs, be] of busy) {
        if (be <= cursor) continue;
        if (bs >= e0) break;
        if (bs > cursor) {
          segments.push({ state: 'online', start: new Date(cursor).toISOString(), end: new Date(bs).toISOString(), minutes: Math.round((bs - cursor) / 60000), is_current: false });
        }
        cursor = Math.max(cursor, be);
        if (cursor >= e0) break;
      }
      if (cursor < e0) {
        segments.push({ state: 'online', start: new Date(cursor).toISOString(), end: new Date(e0).toISOString(), minutes: Math.round((e0 - cursor) / 60000), is_current: isCurrent });
      }
    }
    // 너무 짧은(0분) 잔재 제거
    const cleaned = segments.filter(s => s.minutes > 0);

    return Response.json({ segments: cleaned });
  } catch (e) {
    console.error('/api/states-today error:', e);
    return Response.json({ error: 'DB error' }, { status: 500 });
  }
}
