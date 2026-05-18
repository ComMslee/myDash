import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';

export const dynamic = 'force-dynamic';

// 특정 일자(KST) state 전환 — ?date=YYYY-MM-DD (KST, 미지정=오늘).
// TeslaMate states 는 online/asleep/offline 만 기록 — 주행·충전 중에도 state='online'.
// 반환:
//   - state='online' 서브구간 (drives/charging 제외)
//     · climate_minutes: 그 구간 중 is_climate_on=true 합산 분
//     · soc_drop: 그 구간 동안 battery_level 감소량 (%)
//   - state='charging' (charging_processes 1행 = 1개 segment, soc_added)
export async function GET(request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  try {
    const car = await getDefaultCar();
    if (!car) return Response.json({ error: 'No car' }, { status: 404 });

    const url = new URL(request.url);
    const dateParam = url.searchParams.get('date');
    const nowMs = Date.now();
    const kstNowMs = nowMs + 9 * 3600_000;
    const todayKstStart = Math.floor(kstNowMs / 86400_000) * 86400_000 - 9 * 3600_000;
    let dayStartMs;
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const [y, m, d] = dateParam.split('-').map(Number);
      dayStartMs = Date.UTC(y, m - 1, d) - 9 * 3600_000;
    } else {
      dayStartMs = todayKstStart;
    }
    const dayEndMs = Math.min(dayStartMs + 86400_000, nowMs);
    if (dayEndMs <= dayStartMs) return Response.json({ segments: [], date: dateParam || null });

    const dayStartSec = dayStartMs / 1000;
    const dayEndSec = dayEndMs / 1000;

    const [statesR, drivesR, chargesR] = await Promise.all([
      pool.query(
        `SELECT state, start_date, end_date FROM states
         WHERE car_id = $1 AND COALESCE(end_date, NOW()) > to_timestamp($2) AND start_date < to_timestamp($3)
         ORDER BY start_date ASC`,
        [car.id, dayStartSec, dayEndSec],
      ),
      pool.query(
        `SELECT start_date, end_date FROM drives
         WHERE car_id = $1 AND COALESCE(end_date, NOW()) > to_timestamp($2) AND start_date < to_timestamp($3)`,
        [car.id, dayStartSec, dayEndSec],
      ),
      pool.query(
        `SELECT start_date, end_date,
                start_battery_level::int AS soc_start,
                end_battery_level::int AS soc_end,
                (end_battery_level - start_battery_level)::int AS soc_added
         FROM charging_processes
         WHERE car_id = $1 AND COALESCE(end_date, NOW()) > to_timestamp($2) AND start_date < to_timestamp($3)
         ORDER BY start_date ASC`,
        [car.id, dayStartSec, dayEndSec],
      ),
    ]);

    const clip = (s, e) => [Math.max(s, dayStartMs), Math.min(e, dayEndMs)];
    const busy = [
      ...drivesR.rows.map(r => clip(new Date(r.start_date).getTime(), r.end_date ? new Date(r.end_date).getTime() : nowMs)),
      ...chargesR.rows.map(r => clip(new Date(r.start_date).getTime(), r.end_date ? new Date(r.end_date).getTime() : nowMs)),
    ].filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);

    // online 서브구간 추출
    const onlineSubs = [];
    for (const row of statesR.rows) {
      if (row.state !== 'online') continue;
      const [s0, e0] = clip(new Date(row.start_date).getTime(), row.end_date ? new Date(row.end_date).getTime() : nowMs);
      if (e0 <= s0) continue;
      const isLive = row.end_date == null;
      let cursor = s0;
      for (const [bs, be] of busy) {
        if (be <= cursor) continue;
        if (bs >= e0) break;
        if (bs > cursor) onlineSubs.push({ start: cursor, end: bs, is_current: false });
        cursor = Math.max(cursor, be);
        if (cursor >= e0) break;
      }
      if (cursor < e0) onlineSubs.push({ start: cursor, end: e0, is_current: isLive && e0 === nowMs });
    }

    // 각 online 서브구간에 대해 climate_minutes / soc_drop 계산
    const segments = [];
    for (const sub of onlineSubs) {
      const minutes = Math.round((sub.end - sub.start) / 60000);
      if (minutes <= 0) continue;
      const startTs = new Date(sub.start).toISOString();
      const endTs = new Date(sub.end).toISOString();
      const [climateR, socR] = await Promise.all([
        pool.query(
          `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (run_end - run_start))), 0)::float / 60 AS climate_min
           FROM (
             SELECT MIN(date) AS run_start, MAX(row_end) AS run_end
             FROM (
               SELECT date, row_end, SUM(new_flag) OVER (ORDER BY date) AS isl
               FROM (
                 SELECT date,
                   LEAST(COALESCE(LEAD(date) OVER (ORDER BY date), date + INTERVAL '60 seconds'), date + INTERVAL '5 minutes') AS row_end,
                   CASE WHEN LAG(date) OVER (ORDER BY date) IS NULL THEN 1
                        WHEN EXTRACT(EPOCH FROM (date - LAG(date) OVER (ORDER BY date))) > 300 THEN 1
                        ELSE 0 END AS new_flag
                 FROM positions
                 WHERE car_id = $1 AND date BETWEEN $2::timestamptz AND $3::timestamptz AND is_climate_on = true
               ) f
             ) g GROUP BY isl
             HAVING EXTRACT(EPOCH FROM (MAX(row_end) - MIN(date))) >= 180
           ) runs`,
          [car.id, startTs, endTs],
        ),
        pool.query(
          `WITH bnd AS (
             SELECT
               (SELECT battery_level FROM positions WHERE car_id = $1 AND date <= $2::timestamptz ORDER BY date DESC LIMIT 1) AS soc_s,
               (SELECT battery_level FROM positions WHERE car_id = $1 AND date <= $3::timestamptz ORDER BY date DESC LIMIT 1) AS soc_e
           )
           SELECT GREATEST(COALESCE(soc_s, 0) - COALESCE(soc_e, 0), 0)::float AS drop FROM bnd`,
          [car.id, startTs, endTs],
        ),
      ]);
      const climateMin = Math.round(climateR.rows[0]?.climate_min || 0);
      const socDrop = Math.round((socR.rows[0]?.drop || 0) * 10) / 10;
      // 배터리 손실 패널과 동일 공식 — 시간 점유율 × 드레인%
      //   share = (minutes / totalMinutes) * drop, 0.05% 미만은 의미없음 (compute.js::dropSharePct)
      // 센트리 = online minutes − climate minutes (3분 미만 잔여는 노이즈)
      const SENTRY_MIN = 3;
      const sentryMin = Math.max(0, minutes - climateMin) >= SENTRY_MIN ? minutes - climateMin : 0;
      const sharePct = (m) => {
        if (minutes <= 0 || socDrop <= 0) return null;
        const v = (m / minutes) * socDrop;
        return v < 0.05 ? null : Math.round(v * 10) / 10;
      };
      const climatePct = sharePct(climateMin);
      const sentryPct = sharePct(sentryMin);
      const sentrySuspect = sentryMin >= SENTRY_MIN && sentryPct != null;
      segments.push({
        type: 'online',
        start: startTs,
        end: endTs,
        minutes,
        is_current: sub.is_current,
        climate_minutes: climateMin,
        sentry_minutes: sentryMin,
        soc_drop: socDrop,
        climate_pct: climatePct,
        sentry_pct: sentryPct,
        sentry_suspect: sentrySuspect,
      });
    }

    // 충전 세션
    for (const c of chargesR.rows) {
      const [s, e] = clip(new Date(c.start_date).getTime(), c.end_date ? new Date(c.end_date).getTime() : nowMs);
      if (e <= s) continue;
      segments.push({
        type: 'charging',
        start: new Date(s).toISOString(),
        end: new Date(e).toISOString(),
        minutes: Math.round((e - s) / 60000),
        is_current: c.end_date == null,
        soc_start: c.soc_start,
        soc_end: c.soc_end,
        soc_added: c.soc_added,
      });
    }

    segments.sort((a, b) => new Date(a.start) - new Date(b.start));
    return Response.json({ segments, date: dateParam || null });
  } catch (e) {
    console.error('/api/states-today error:', e);
    return Response.json({ error: 'DB error' }, { status: 500 });
  }
}
