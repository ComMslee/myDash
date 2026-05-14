import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';

export const dynamic = 'force-dynamic';

// 특정 일자(KST) state 전환 타임라인 — TeslaMate states.
// ?date=YYYY-MM-DD (KST, 미지정 시 오늘).
// TeslaMate states 는 online/asleep/offline 만 기록 — 주행·충전 중에도 state='online'.
// 그래서 online 구간에서 drives/charging_processes 시간을 잘라 "그냥 깬" 구간만 추출.
export async function GET(request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  try {
    const car = await getDefaultCar();
    if (!car) return Response.json({ error: 'No car' }, { status: 404 });

    const url = new URL(request.url);
    const dateParam = url.searchParams.get('date'); // 'YYYY-MM-DD' KST
    const nowMs = Date.now();

    // KST 자정 = UTC -9h
    const kstNowMs = nowMs + 9 * 3600_000;
    const todayKstStart = Math.floor(kstNowMs / 86400_000) * 86400_000 - 9 * 3600_000;
    let dayStartMs;
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const [y, m, d] = dateParam.split('-').map(Number);
      dayStartMs = Date.UTC(y, m - 1, d) - 9 * 3600_000; // KST 자정 → UTC ms
    } else {
      dayStartMs = todayKstStart;
    }
    const dayEndMs = Math.min(dayStartMs + 86400_000, nowMs);
    if (dayEndMs <= dayStartMs) {
      return Response.json({ segments: [], date: dateParam || null });
    }

    const [statesR, drivesR, chargesR] = await Promise.all([
      pool.query(
        `SELECT state, start_date, end_date FROM states
         WHERE car_id = $1
           AND COALESCE(end_date, NOW()) > to_timestamp($2)
           AND start_date < to_timestamp($3)
         ORDER BY start_date ASC`,
        [car.id, dayStartMs / 1000, dayEndMs / 1000],
      ),
      pool.query(
        `SELECT start_date, end_date FROM drives
         WHERE car_id = $1
           AND COALESCE(end_date, NOW()) > to_timestamp($2)
           AND start_date < to_timestamp($3)`,
        [car.id, dayStartMs / 1000, dayEndMs / 1000],
      ),
      pool.query(
        `SELECT start_date, end_date FROM charging_processes
         WHERE car_id = $1
           AND COALESCE(end_date, NOW()) > to_timestamp($2)
           AND start_date < to_timestamp($3)`,
        [car.id, dayStartMs / 1000, dayEndMs / 1000],
      ),
    ]);

    const clip = (s, e) => [Math.max(s, dayStartMs), Math.min(e, dayEndMs)];
    const busy = [...drivesR.rows, ...chargesR.rows]
      .map(r => clip(new Date(r.start_date).getTime(), r.end_date ? new Date(r.end_date).getTime() : nowMs))
      .filter(([s, e]) => e > s)
      .sort((a, b) => a[0] - b[0]);

    const segments = [];
    for (const row of statesR.rows) {
      const [s0, e0] = clip(new Date(row.start_date).getTime(), row.end_date ? new Date(row.end_date).getTime() : nowMs);
      if (e0 <= s0) continue;
      const isCurrent = row.end_date == null && e0 === nowMs;
      if (row.state !== 'online') {
        segments.push({ state: row.state, start: new Date(s0).toISOString(), end: new Date(e0).toISOString(), minutes: Math.round((e0 - s0) / 60000), is_current: isCurrent });
        continue;
      }
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
    const cleaned = segments.filter(s => s.minutes > 0);

    return Response.json({ segments: cleaned, date: dateParam || null });
  } catch (e) {
    console.error('/api/states-today error:', e);
    return Response.json({ error: 'DB error' }, { status: 500 });
  }
}
