import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';
import { queryChargingSessions } from '@/lib/queries/battery-idle';
import { withCache } from '@/lib/server-cache';
import { TTL_180S } from '@/lib/cache-ttls';

export const dynamic = 'force-dynamic';

const LIMIT = 20;

function mapIdleRow(r) {
  return {
    idle_start: r.idle_start,
    idle_end: r.idle_end,
    soc_start: parseInt(r.soc_start),
    soc_end: parseInt(r.soc_end),
    soc_drop: parseInt(r.soc_drop),
    idle_hours: parseFloat(r.idle_hours),
    next_type: r.next_type,
    climate_minutes: parseFloat(r.climate_minutes) || 0,
    climate_spans: Array.isArray(r.climate_spans)
      ? r.climate_spans.map(sp => ({ s: Number(sp.s), e: Number(sp.e) }))
      : [],
    online_minutes: parseFloat(r.online_minutes) || 0,
    online_spans: Array.isArray(r.online_spans)
      ? r.online_spans.map(sp => ({ s: Number(sp.s), e: Number(sp.e) }))
      : [],
  };
}

export async function GET(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;

  const sp = new URL(req.url).searchParams;
  const isSummary = sp.get('summary') === '1';
  const isMore = sp.has('offset');
  const offset = Math.max(0, parseInt(sp.get('offset') || '0', 10));

  try {
    const car = await getDefaultCar();
    if (!car) return Response.json({ error: 'No car found' }, { status: 404 });
    const carId = car.id;

    // ?summary=1 — LATERAL 없는 경량 집계 (즉시 표시용)
    if (isSummary) {
      return Response.json(await withCache(`idle-drain-summary:${carId}`, TTL_180S, async () => {
        const r = await pool.query(
          `WITH timeline AS (
             SELECT start_date AS ts, end_date AS te,
               (SELECT battery_level FROM positions WHERE id = start_position_id) AS start_soc,
               (SELECT battery_level FROM positions WHERE id = end_position_id) AS end_soc
             FROM drives
             WHERE car_id = $1 AND end_date IS NOT NULL AND end_position_id IS NOT NULL
             UNION ALL
             SELECT start_date, end_date, start_battery_level::int, end_battery_level::int
             FROM charging_processes
             WHERE car_id = $1 AND end_date IS NOT NULL AND end_battery_level IS NOT NULL
             ORDER BY ts
           ),
           idle AS (
             SELECT
               LEAD(ts) OVER (ORDER BY ts) AS idle_end,
               te AS idle_start,
               end_soc AS soc_start,
               LEAD(start_soc) OVER (ORDER BY ts) AS soc_end
             FROM timeline
           ),
           filtered AS (
             SELECT
               GREATEST(soc_start - soc_end, 0)::float AS soc_drop,
               EXTRACT(EPOCH FROM idle_end - idle_start) / 3600.0 AS idle_hours
             FROM idle
             WHERE idle_end IS NOT NULL
               AND EXTRACT(EPOCH FROM idle_end - idle_start) > 1800
               AND soc_start IS NOT NULL AND soc_end IS NOT NULL
           )
           SELECT
             COUNT(*)::int AS total_count,
             ROUND(AVG(soc_drop / NULLIF(idle_hours / 24.0, 0))::numeric, 1)::float AS avg_drain_per_day,
             ROUND(AVG(idle_hours)::numeric, 1)::float AS avg_idle_hours
           FROM filtered`,
          [carId]
        );
        const row = r.rows[0];
        return {
          total_count: row.total_count || 0,
          avg_drain_per_day: row.avg_drain_per_day || 0,
          avg_idle_hours: row.avg_idle_hours || 0,
        };
      }));
    }

    // 상세 records — 초기(no offset) 또는 더보기(?offset=N)
    const cacheKey = `idle-drain:${carId}:${offset}`;
    const [idleRes, sessRes] = await Promise.all([
      withCache(cacheKey, TTL_180S, async () => {
        const result = await pool.query(
          `WITH timeline AS (
             SELECT start_date AS ts, end_date AS te,
               (SELECT battery_level FROM positions WHERE id = start_position_id) AS start_soc,
               (SELECT battery_level FROM positions WHERE id = end_position_id) AS end_soc,
               'drive'::text AS ev_type
             FROM drives WHERE car_id = $1 AND end_date IS NOT NULL AND end_position_id IS NOT NULL
             UNION ALL
             SELECT start_date, end_date, start_battery_level::int, end_battery_level::int, 'charge'::text
             FROM charging_processes WHERE car_id = $1 AND end_date IS NOT NULL AND end_battery_level IS NOT NULL
             ORDER BY ts
           ),
           idle AS (
             SELECT
               te AS idle_start,
               LEAD(ts) OVER (ORDER BY ts) AS idle_end,
               end_soc AS soc_start,
               LEAD(start_soc) OVER (ORDER BY ts) AS soc_end,
               LEAD(ev_type) OVER (ORDER BY ts) AS next_type
             FROM timeline
           ),
           filtered AS (
             SELECT idle_start, idle_end, soc_start, soc_end, next_type,
               GREATEST(soc_start - soc_end, 0) AS soc_drop,
               ROUND(EXTRACT(EPOCH FROM idle_end - idle_start) / 3600, 1)::float AS idle_hours
             FROM idle
             WHERE idle_end IS NOT NULL
               AND EXTRACT(EPOCH FROM idle_end - idle_start) > 1800
               AND soc_start IS NOT NULL AND soc_end IS NOT NULL
             ORDER BY idle_start DESC
             LIMIT $2 OFFSET $3
           )
           SELECT f.idle_start, f.idle_end, f.soc_start, f.soc_end, f.next_type,
             f.soc_drop, f.idle_hours,
             COALESCE(c.climate_minutes, 0)::float AS climate_minutes,
             COALESCE(c.spans, '[]'::jsonb) AS climate_spans,
             COALESCE(o.online_minutes, 0)::float AS online_minutes,
             COALESCE(o.spans, '[]'::jsonb) AS online_spans
           FROM filtered f
           LEFT JOIN LATERAL (
             SELECT
               COALESCE(jsonb_agg(jsonb_build_object('s', FLOOR(EXTRACT(EPOCH FROM run_start)*1000)::bigint,'e', FLOOR(EXTRACT(EPOCH FROM run_end)*1000)::bigint) ORDER BY run_start),'[]'::jsonb) AS spans,
               ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (run_end - run_start))), 0)::numeric / 60, 1) AS climate_minutes
             FROM (
               SELECT MIN(date) AS run_start, MAX(row_end) AS run_end
               FROM (
                 SELECT date, row_end, SUM(new_island_flag) OVER (ORDER BY date) AS island_id
                 FROM (
                   SELECT date,
                     LEAST(COALESCE(next_date, date + INTERVAL '60 seconds'), date + INTERVAL '5 minutes') AS row_end,
                     CASE WHEN LAG(date) OVER (ORDER BY date) IS NULL THEN 1
                          WHEN EXTRACT(EPOCH FROM (date - LAG(date) OVER (ORDER BY date))) > 300 THEN 1
                          ELSE 0 END AS new_island_flag
                   FROM (
                     SELECT date, is_climate_on, LEAD(date) OVER (ORDER BY date) AS next_date
                     FROM positions
                     WHERE car_id = $1 AND date BETWEEN f.idle_start AND f.idle_end
                   ) raw_pos
                   WHERE is_climate_on = true
                 ) flagged
               ) islanded
               GROUP BY island_id
               HAVING EXTRACT(EPOCH FROM (MAX(row_end) - MIN(date))) >= 180
             ) runs
           ) c ON true
           LEFT JOIN LATERAL (
             SELECT
               COALESCE(jsonb_agg(jsonb_build_object('s', FLOOR(EXTRACT(EPOCH FROM seg_start)*1000)::bigint,'e', FLOOR(EXTRACT(EPOCH FROM seg_end)*1000)::bigint) ORDER BY seg_start),'[]'::jsonb) AS spans,
               ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (seg_end - seg_start))), 0)::numeric / 60, 1) AS online_minutes
             FROM (
               SELECT GREATEST(s.start_date, f.idle_start) AS seg_start,
                      LEAST(COALESCE(s.end_date, NOW()), f.idle_end) AS seg_end
               FROM states s
               WHERE s.car_id = $1 AND s.state = 'online'
                 AND s.start_date < f.idle_end
                 AND COALESCE(s.end_date, NOW()) > f.idle_start
             ) clipped
             WHERE seg_end > seg_start
           ) o ON true
           ORDER BY f.idle_start DESC`,
          [carId, LIMIT + 1, offset]
        );
        return result.rows;
      }),
      isMore ? Promise.resolve(null) : queryChargingSessions(carId),
    ]);

    const rows = Array.isArray(idleRes) ? idleRes : [];
    const has_more = rows.length > LIMIT;

    return Response.json({
      idle_drain: rows.slice(0, LIMIT).map(mapIdleRow),
      has_more,
      offset,
      ...(sessRes && {
        charging_sessions: sessRes.rows.map(r => ({
          start: r.start_date,
          end: r.end_date,
          soc_start: parseInt(r.soc_start),
          soc_end: parseInt(r.soc_end),
          soc_added: parseInt(r.soc_added),
          duration_hours: parseFloat(r.duration_hours),
        })),
      }),
    });
  } catch (err) {
    console.error('/api/idle-drain error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
