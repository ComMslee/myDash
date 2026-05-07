// 집충전기 폴링 로그 — 시간 단위 버킷에 시도/성공/재시도/쿼터 카운트 누적 + 일별 집계.
// manualAttempts:  /api/home-charger?refresh=1 경로 (수동 갱신 버튼)
// retrySuccesses:  첫 시도 실패 후 즉시 1회 재시도에서 성공
// retries:         재시도도 실패

import pool from '@/lib/db';
import { kstDateStr, KST_OFFSET_MS } from '@/lib/kst';
import { ensureTable } from './schema';

export async function recordPollLog({
  attempts = 0, successes = 0, partial = 0,
  retries = 0, retrySuccesses = 0,
  quotaHits = 0, manualAttempts = 0, warmCalls = 0,
} = {}) {
  try {
    await ensureTable();
    const now = Date.now();
    const kstHour = new Date(now + KST_OFFSET_MS).getUTCHours();
    const kstDate = kstDateStr(now);
    await pool.query(
      `INSERT INTO home_charger_poll_log (date, hour, attempts, successes, partial, retries, retry_successes, quota_hits, manual_attempts, warm_calls)
       VALUES ($1::date, $2::smallint, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (date, hour) DO UPDATE
         SET attempts        = home_charger_poll_log.attempts        + EXCLUDED.attempts,
             successes       = home_charger_poll_log.successes       + EXCLUDED.successes,
             partial         = home_charger_poll_log.partial         + EXCLUDED.partial,
             retries         = home_charger_poll_log.retries         + EXCLUDED.retries,
             retry_successes = home_charger_poll_log.retry_successes + EXCLUDED.retry_successes,
             quota_hits      = home_charger_poll_log.quota_hits      + EXCLUDED.quota_hits,
             manual_attempts = home_charger_poll_log.manual_attempts + EXCLUDED.manual_attempts,
             warm_calls      = home_charger_poll_log.warm_calls      + EXCLUDED.warm_calls,
             updated_at      = NOW()`,
      [kstDate, kstHour, attempts, successes, partial, retries, retrySuccesses, quotaHits, manualAttempts, warmCalls]
    );
  } catch (e) {
    console.warn('[home-charger] poll log failed:', e.message);
  }
}

// 특정 날짜(기본 오늘)의 24시간 폴링 로그 조회
export async function fetchPollLogDb(date) {
  try {
    await ensureTable();
    const target = date || kstDateStr(Date.now());
    const res = await pool.query(
      `SELECT hour, attempts, successes, partial, retries, retry_successes, quota_hits, manual_attempts, warm_calls
         FROM home_charger_poll_log
        WHERE date = $1::date
        ORDER BY hour`,
      [target]
    );
    const rowsByHour = {};
    for (const r of res.rows) {
      rowsByHour[Number(r.hour)] = {
        hour: Number(r.hour),
        attempts: Number(r.attempts),
        successes: Number(r.successes),
        partial: Number(r.partial),
        retries: Number(r.retries),
        retrySuccesses: Number(r.retry_successes),
        quotaHits: Number(r.quota_hits),
        manualAttempts: Number(r.manual_attempts),
        warmCalls: Number(r.warm_calls),
      };
    }
    const empty = { attempts: 0, successes: 0, partial: 0, retries: 0, retrySuccesses: 0, quotaHits: 0, manualAttempts: 0, warmCalls: 0 };
    const hourly = [];
    for (let h = 0; h < 24; h++) {
      hourly.push(rowsByHour[h] || { hour: h, ...empty });
    }
    const totals = hourly.reduce((a, r) => ({
      attempts: a.attempts + r.attempts,
      successes: a.successes + r.successes,
      partial: a.partial + r.partial,
      retries: a.retries + r.retries,
      retrySuccesses: a.retrySuccesses + (r.retrySuccesses || 0),
      quotaHits: a.quotaHits + r.quotaHits,
      manualAttempts: a.manualAttempts + r.manualAttempts,
      warmCalls: a.warmCalls + (r.warmCalls || 0),
    }), { ...empty });
    return { date: target, hourly, totals };
  } catch (e) {
    console.warn('[home-charger] poll log fetch failed:', e.message);
    return { date: null, hourly: [], totals: {} };
  }
}

// 일별 집계 — 최근 N일 (기본 14일)
export async function fetchPollLogDailyDb(days = 14) {
  try {
    await ensureTable();
    const clampDays = Math.max(1, Math.min(90, Math.floor(Number(days) || 14)));
    const [dailyRes, byDateHourRes] = await Promise.all([
      pool.query(
        `SELECT to_char(date, 'YYYY-MM-DD') AS date_str,
                SUM(attempts)::int         AS attempts,
                SUM(successes)::int        AS successes,
                SUM(partial)::int          AS partial,
                SUM(retries)::int          AS retries,
                SUM(retry_successes)::int  AS retry_successes,
                SUM(quota_hits)::int       AS quota_hits,
                SUM(manual_attempts)::int  AS manual_attempts,
                SUM(warm_calls)::int       AS warm_calls
           FROM home_charger_poll_log
          WHERE date >= (((NOW() AT TIME ZONE 'Asia/Seoul')::date) - ($1::int * INTERVAL '1 day'))::date
          GROUP BY date
          ORDER BY date DESC`,
        [clampDays]
      ),
      // 일별 × 시간대 히트맵 원본 — (date, hour) PK라 행당 단일 행
      pool.query(
        `SELECT to_char(date, 'YYYY-MM-DD') AS date_str,
                hour,
                retries,
                quota_hits,
                attempts
           FROM home_charger_poll_log
          WHERE date >= (((NOW() AT TIME ZONE 'Asia/Seoul')::date) - ($1::int * INTERVAL '1 day'))::date
          ORDER BY date DESC, hour`,
        [clampDays]
      ),
    ]);
    const daily = dailyRes.rows.map(r => ({
      date: r.date_str,
      attempts: Number(r.attempts),
      successes: Number(r.successes),
      partial: Number(r.partial),
      retries: Number(r.retries),
      retrySuccesses: Number(r.retry_successes),
      quotaHits: Number(r.quota_hits),
      manualAttempts: Number(r.manual_attempts),
      warmCalls: Number(r.warm_calls),
    }));
    const totals = daily.reduce((a, r) => ({
      attempts: a.attempts + r.attempts,
      successes: a.successes + r.successes,
      partial: a.partial + r.partial,
      retries: a.retries + r.retries,
      retrySuccesses: a.retrySuccesses + r.retrySuccesses,
      quotaHits: a.quotaHits + r.quotaHits,
      manualAttempts: a.manualAttempts + r.manualAttempts,
      warmCalls: a.warmCalls + r.warmCalls,
    }), { attempts: 0, successes: 0, partial: 0, retries: 0, retrySuccesses: 0, quotaHits: 0, manualAttempts: 0, warmCalls: 0 });
    const emptyHour = () => ({ retries: 0, quotaHits: 0, attempts: 0 });
    const dateToHours = new Map();
    for (const r of byDateHourRes.rows) {
      const date = r.date_str;
      const h = Number(r.hour);
      if (h < 0 || h >= 24) continue;
      if (!dateToHours.has(date)) {
        dateToHours.set(date, Array.from({ length: 24 }, emptyHour));
      }
      dateToHours.get(date)[h] = {
        retries: Number(r.retries) || 0,
        quotaHits: Number(r.quota_hits) || 0,
        attempts: Number(r.attempts) || 0,
      };
    }
    const dailyByHour = daily.map(d => ({
      date: d.date,
      hours: dateToHours.get(d.date) || Array.from({ length: 24 }, emptyHour),
    }));
    return { days: clampDays, daily, totals, dailyByHour };
  } catch (e) {
    console.warn('[home-charger] poll log daily fetch failed:', e.message);
    return { days: 0, daily: [], totals: {}, dailyByHour: [] };
  }
}
