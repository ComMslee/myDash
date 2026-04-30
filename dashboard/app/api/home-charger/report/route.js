import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { ensureTable } from '@/lib/home-charger/schema';

export const dynamic = 'force-dynamic';

// 단지 충전 인프라 활용도 라이브 리포트.
// 외부(관리사무소·환경공단·확장 제안) 근거자료용 — 실시간 갱신.
// charger_usage_daily 의 30분 단위 count 누적을 월별·시간대×요일 등으로 집계.
//
// count 정의: (stat_id, chger_id, date, hour) 슬롯 별 0~2 (30분 룰).
// 월별 점유율 = SUM(count) / (chargers × days × 48) × 100.

const TOTAL_SLOTS_PER_DAY = 48; // 30분 × 2

export async function GET() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  try {
    await ensureTable();

    // 0) 메타 — 관측 시작/끝, 충전기 수.
    const metaRes = await pool.query(
      `SELECT
         MIN(date) AS observation_start,
         MAX(date) AS observation_end,
         COUNT(DISTINCT (stat_id, chger_id))::int AS observed_chargers
       FROM charger_usage_daily`
    );
    const meta = metaRes.rows[0];
    const startDate = meta.observation_start;
    const endDate = meta.observation_end;
    const totalChargers = meta.observed_chargers || 0;

    if (!startDate) {
      return Response.json({
        meta: { observation_start: null, observation_end: null, total_chargers: 0 },
        kpi: null, monthly: [], hourly_dow: null,
      });
    }

    const daysObserved = Math.max(1,
      Math.floor((new Date(endDate) - new Date(startDate)) / 86400000) + 1);

    // 1) 월별 시계열 — sessions + occupancy_pct.
    //    occupancy_pct = SUM(count) / (chargers_in_month × days_in_month × 48) × 100.
    const monthlyRes = await pool.query(
      `WITH m AS (
         SELECT
           to_char(date, 'YYYY-MM')                       AS ym,
           SUM(count)::int                                 AS sessions,
           COUNT(DISTINCT date)::int                       AS days,
           COUNT(DISTINCT (stat_id, chger_id))::int        AS chargers
         FROM charger_usage_daily
         GROUP BY to_char(date, 'YYYY-MM')
       )
       SELECT ym, sessions, days, chargers,
              CASE WHEN chargers > 0 AND days > 0
                   THEN ROUND(sessions::numeric / (chargers * days * 48) * 100, 1)
                   ELSE 0 END AS occupancy_pct
       FROM m ORDER BY ym`
    );
    const monthly = monthlyRes.rows.map(r => ({
      ym: r.ym,
      sessions: r.sessions,
      days: r.days,
      chargers: r.chargers,
      occupancy_pct: parseFloat(r.occupancy_pct),
    }));

    // 2) KPI — 누적 + 일평균 + 피크 시간대 + 6개월 추세.
    const totalRes = await pool.query(
      `SELECT SUM(count)::int AS total FROM charger_usage_daily`
    );
    const totalSessions = totalRes.rows[0].total || 0;

    const peakRes = await pool.query(
      `SELECT EXTRACT(DOW FROM date)::int AS dow,
              hour::int                    AS hour,
              SUM(count)::int               AS total,
              COUNT(DISTINCT date)::int     AS days
       FROM charger_usage_daily
       GROUP BY EXTRACT(DOW FROM date), hour
       ORDER BY total DESC
       LIMIT 1`
    );
    const peak = peakRes.rows[0] || null;

    // 6개월 추세 — 최근 6개월 평균 vs 직전 6개월 평균 (occupancy_pct 차이).
    let trend6mDelta = null;
    if (monthly.length >= 4) {
      const last6  = monthly.slice(-6);
      const prev6  = monthly.slice(-12, -6);
      const avg = (arr) => arr.length
        ? arr.reduce((s, r) => s + r.occupancy_pct, 0) / arr.length : null;
      const a = avg(last6), b = avg(prev6);
      if (a != null && b != null) trend6mDelta = parseFloat((a - b).toFixed(1));
    }

    // 주평균 — 최근 7일 가동률.
    const weekRes = await pool.query(
      `WITH w AS (
         SELECT SUM(count)::int                            AS sessions,
                COUNT(DISTINCT date)::int                  AS days,
                COUNT(DISTINCT (stat_id, chger_id))::int   AS chargers
         FROM charger_usage_daily
         WHERE date >= CURRENT_DATE - INTERVAL '7 days'
       )
       SELECT CASE WHEN chargers > 0 AND days > 0
                   THEN ROUND(sessions::numeric / (chargers * days * 48) * 100, 1)
                   ELSE NULL END AS pct,
              sessions
       FROM w`
    );
    const weeklyAvgPct = weekRes.rows[0].pct != null
      ? parseFloat(weekRes.rows[0].pct) : null;

    // 피크 빈도 — 시간당 점유율 ≥ 70% 발생 시간이 전체 시간의 몇 %.
    //   시간당 점유 = SUM(count for that hour) / (chargers × 2)
    const PEAK_THRESHOLD = 0.70;
    const peakFreqRes = await pool.query(
      `WITH per_hour AS (
         SELECT date, hour,
                SUM(count)::float AS sessions,
                COUNT(DISTINCT (stat_id, chger_id))::int AS chargers
         FROM charger_usage_daily
         GROUP BY date, hour
       ), classified AS (
         SELECT CASE WHEN chargers > 0
                     THEN sessions / (chargers * 2.0) ELSE 0 END AS pct
         FROM per_hour
       )
       SELECT COUNT(*)::int                                  AS total_hours,
              COUNT(*) FILTER (WHERE pct >= $1)::int         AS peak_hours
       FROM classified`,
      [PEAK_THRESHOLD]
    );
    const peakFreq = peakFreqRes.rows[0];
    const peakFreqPct = peakFreq.total_hours > 0
      ? parseFloat((peakFreq.peak_hours / peakFreq.total_hours * 100).toFixed(1))
      : 0;

    const kpi = {
      total_sessions: totalSessions,
      days_observed: daysObserved,
      total_chargers: totalChargers,
      daily_avg_sessions: parseFloat((totalSessions / daysObserved).toFixed(1)),
      avg_occupancy_pct: parseFloat((totalSessions / (totalChargers * daysObserved * TOTAL_SLOTS_PER_DAY) * 100).toFixed(1)),
      weekly_avg_pct: weeklyAvgPct,
      peak_freq_pct: peakFreqPct,
      peak_freq_threshold_pct: PEAK_THRESHOLD * 100,
      peak_dow:  peak?.dow ?? null,
      peak_hour: peak?.hour ?? null,
      peak_avg_count: peak ? parseFloat((peak.total / peak.days).toFixed(1)) : null,
      trend_6m_delta_pp: trend6mDelta,
    };

    // 3) 시간대 × 요일 히트맵 — 7×24, 평균 점유율 (30분 정규화 평균 → 0~100%).
    //    cell = AVG(count / 2) × 100 = AVG(count) × 50.
    const heatRes = await pool.query(
      `SELECT EXTRACT(DOW FROM date)::int AS dow,
              hour::int                    AS hour,
              ROUND(AVG(count)::numeric * 50, 1) AS occupancy_pct
       FROM charger_usage_daily
       GROUP BY EXTRACT(DOW FROM date), hour
       ORDER BY dow, hour`
    );
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const r of heatRes.rows) {
      grid[r.dow][r.hour] = parseFloat(r.occupancy_pct);
    }

    return Response.json({
      meta: {
        observation_start: startDate,
        observation_end: endDate,
        days_observed: daysObserved,
        total_chargers: totalChargers,
        complex_name: '망포늘푸른벽산아파트',
      },
      kpi,
      monthly,
      hourly_dow: grid,
    });
  } catch (e) {
    console.error('/api/home-charger/report error:', e);
    return Response.json({ error: 'DB error', detail: e.message }, { status: 500 });
  }
}
