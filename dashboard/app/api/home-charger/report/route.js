import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { ensureTable } from '@/lib/home-charger/schema';
import { getCache } from '@/lib/home-charger-cache';
import {
  P1_108_IDS, P1_107_IDS, P2_102_IDS, P2_104_IDS,
  P3_105_IDS, P3_111_IDS, P3_117_IDS, P3_115_IDS,
  STATION_115_UNDERGROUND, STATION_119F, MAIN_STATION_ID,
} from '@/app/v2/battery/home-charger/constants';

const DONG_GROUPS = [
  { key: '108', title: '108동',   favorite: true,  parts: [{ statId: MAIN_STATION_ID, ids: P1_108_IDS }] },
  { key: '107', title: '107동',   favorite: true,  parts: [{ statId: MAIN_STATION_ID, ids: P1_107_IDS }] },
  { key: '102', title: '102동',   favorite: true,  parts: [{ statId: MAIN_STATION_ID, ids: P2_102_IDS }] },
  { key: '104', title: '104동',   favorite: true,  parts: [{ statId: MAIN_STATION_ID, ids: P2_104_IDS }] },
  { key: '105', title: '105동',   favorite: false, parts: [{ statId: MAIN_STATION_ID, ids: P3_105_IDS }] },
  { key: '111', title: '111동',   favorite: false, parts: [{ statId: MAIN_STATION_ID, ids: P3_111_IDS }] },
  { key: '117', title: '117동',   favorite: false, parts: [{ statId: MAIN_STATION_ID, ids: P3_117_IDS }] },
  { key: '115', title: '115동',   favorite: false, parts: [
    { statId: MAIN_STATION_ID, ids: P3_115_IDS },
    { statId: STATION_115_UNDERGROUND, ids: '*' },
  ] },
  { key: '119', title: '119동 앞', favorite: false, parts: [{ statId: STATION_119F, ids: '*' }] },
];

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

    // 0) 메타 — 관측 시작/끝.
    //    충전기 수는 환경공단 API 응답(home-charger 캐시) 기준 — 실제 등록 갯수.
    //    DB COUNT 는 충전 발생한 충전기만 잡혀 일부 누락 (사용 0 인 신규/오프라인).
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
    const observedChargers = meta.observed_chargers || 0;

    // 등록 충전기 수 (환경공단 API 캐시 기준)
    const cache = getCache();
    const registeredChargers = cache?.data?.stations
      ? cache.data.stations.reduce((s, st) => s + (st.chargers?.length || 0), 0)
      : 0;
    const totalChargers = registeredChargers || observedChargers;

    if (!startDate) {
      return Response.json({
        meta: { observation_start: null, observation_end: null, total_chargers: 0 },
        kpi: null, monthly: [], hourly_dow: null,
      });
    }

    const daysObserved = Math.max(1,
      Math.floor((new Date(endDate) - new Date(startDate)) / 86400000) + 1);

    // 1) 주별 시계열 — sessions + occupancy_pct.
    //    date_trunc('week') = ISO 월요일 기준. 분모 = totalChargers × 그 주 일수 × 48.
    const weeklyRes = await pool.query(
      `WITH w AS (
         SELECT
           date_trunc('week', date)::date          AS w_start,
           SUM(count)::int                          AS sessions,
           COUNT(DISTINCT date)::int                AS days
         FROM charger_usage_daily
         GROUP BY date_trunc('week', date)
       )
       SELECT
         to_char(w_start, 'YYYY-MM-DD') AS w_start,
         to_char(w_start, 'MM/DD')      AS label,
         sessions,
         days,
         CASE WHEN days > 0 AND $1 > 0
              THEN ROUND(sessions::numeric / ($1 * days * 48) * 100, 1)
              ELSE 0 END AS occupancy_pct
       FROM w ORDER BY w_start`,
      [totalChargers]
    );
    const weekly = weeklyRes.rows.map(r => ({
      w_start: r.w_start,
      label: r.label,
      sessions: r.sessions,
      days: r.days,
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

    // 주평균 — 최근 7일 가동률. 분모 = totalChargers × 일수 × 48.
    const weekRes = await pool.query(
      `SELECT SUM(count)::int     AS sessions,
              COUNT(DISTINCT date)::int AS days
       FROM charger_usage_daily
       WHERE date >= CURRENT_DATE - INTERVAL '7 days'`
    );
    const weekRow = weekRes.rows[0];
    const weeklyAvgPct = (totalChargers > 0 && weekRow.days > 0)
      ? parseFloat((weekRow.sessions / (totalChargers * weekRow.days * 48) * 100).toFixed(1))
      : null;

    // 피크 빈도 — 시간당 점유율 ≥ 70% 발생 시간이 전체 시간의 몇 %.
    //   시간당 점유 = SUM(count for that hour) / (totalChargers × 2)
    //   분모는 등록 충전기 전체 수 — '시간 슬롯 내 unique 충전기' 가 아님 (예전 분모는 0~%↑ 부풀려짐).
    const PEAK_THRESHOLD = 0.70;
    const peakFreqRes = await pool.query(
      `WITH per_hour AS (
         SELECT date, hour, SUM(count)::float AS sessions
         FROM charger_usage_daily
         GROUP BY date, hour
       )
       SELECT COUNT(*)::int                                                 AS total_hours,
              COUNT(*) FILTER (WHERE sessions >= $1 * $2 * 2.0)::int        AS peak_hours
       FROM per_hour`,
      [PEAK_THRESHOLD, totalChargers || 1]
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

    // 3) 동별 가동률 — constants.js 동별 매핑으로 (stat_id, chger_id) 그룹.
    //    분모: 동 충전기수 × 관측 일수 × 48.
    const perChargerRes = await pool.query(
      `SELECT stat_id, chger_id,
              SUM(count)::int AS sessions
       FROM charger_usage_daily
       GROUP BY stat_id, chger_id`
    );
    const perCharger = new Map();
    for (const r of perChargerRes.rows) {
      perCharger.set(`${r.stat_id}|${r.chger_id}`, r.sessions);
    }
    // 등록 충전기 — 캐시 응답에서 동별 합산 분모 산출.
    const stationsById = new Map(
      (cache?.data?.stations || []).map((s) => [s.station.statId, s.chargers || []])
    );

    const byDong = DONG_GROUPS.map((g) => {
      let sessions = 0;
      let chargersInDong = 0;
      for (const p of g.parts) {
        const cs = stationsById.get(p.statId) || [];
        const filtered = p.ids === '*' ? cs : cs.filter((c) => p.ids.includes(c.chgerId));
        chargersInDong += filtered.length;
        for (const c of filtered) {
          sessions += perCharger.get(`${p.statId}|${c.chgerId}`) || 0;
        }
      }
      const denom = chargersInDong * daysObserved * TOTAL_SLOTS_PER_DAY;
      const occupancy_pct = denom > 0 ? parseFloat((sessions / denom * 100).toFixed(1)) : 0;
      return {
        key: g.key, title: g.title, favorite: g.favorite,
        total: chargersInDong, sessions, occupancy_pct,
      };
    }).filter((d) => d.total > 0);

    return Response.json({
      meta: {
        observation_start: startDate,
        observation_end: endDate,
        days_observed: daysObserved,
        total_chargers: totalChargers,
        observed_chargers: observedChargers,
        complex_name: '망포늘푸른벽산아파트',
      },
      kpi,
      weekly,
      by_dong: byDong,
    });
  } catch (e) {
    console.error('/api/home-charger/report error:', e);
    return Response.json({ error: 'DB error', detail: e.message }, { status: 500 });
  }
}
