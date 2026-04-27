// 단지 전체 집계 — 시간대/요일 히스토그램 + 충전기 순위(전일 대비 변동 포함)
// hourly/dow:        기간 스코프 (charger_usage_daily, 1~12개월)
// hourlyAllTime/dow: 전체 누적 (charger_usage_daily 전체)
// perCharger:        전체 누적 랭킹 + 전일 대비 delta/isNew/prevRank
// 캐시된 스테이션 목록의 미사용 충전기도 0건으로 순위 포함

import pool from '@/lib/db';
import { ensureTable } from './schema';
import { getCache } from '@/lib/home-charger-cache';

export async function fetchFleetStatsDb(statIds, months) {
  const clampMonths = Math.max(1, Math.min(12, Math.floor(Number(months) || 3)));
  const empty = {
    hourly: Array(24).fill(0),
    hourlyAllTime: Array(24).fill(0),
    dow: Array(7).fill(0),
    dowAllTime: Array(7).fill(0),
    perCharger: [],
    total: 0,
    daysCovered: 0,
    allTimeTotal: 0,
    months: clampMonths,
  };
  try {
    await ensureTable();
    if (!statIds.length) return empty;

    // 1) 기간 스코프 (일별 테이블) — 시간대/요일
    const dailyRes = await pool.query(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date_str, hour, count
         FROM charger_usage_daily
        WHERE stat_id = ANY($1)
          AND date >= (((NOW() AT TIME ZONE 'Asia/Seoul')::date) - ($2::int * INTERVAL '1 month'))::date
      `,
      [statIds, clampMonths]
    );
    const hourly = new Array(24).fill(0);
    const dow = new Array(7).fill(0);
    const dateSet = new Set();
    let periodTotal = 0;
    for (const row of dailyRes.rows) {
      // 시간당 최대 1포인트 정규화 — raw count(0~2)를 0/1로 clip
      const c = Math.min(1, Number(row.count));
      periodTotal += c;
      hourly[row.hour] += c;
      const [y, m, d] = row.date_str.split('-').map(Number);
      const dowIdx = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      dow[dowIdx] += c;
      dateSet.add(row.date_str);
    }

    // 2) Top/Bottom 순위 — charger_usage_daily에서 1시간당 최대 1포인트로 정규화
    //    (기존 charger_usage는 30분 룰로 시간당 최대 2 포인트라 실제 "사용 시간 수"와 괴리)
    const rankRes = await pool.query(
      `SELECT stat_id, chger_id, SUM(LEAST(count, 1))::bigint AS total
         FROM charger_usage_daily
        WHERE stat_id = ANY($1)
        GROUP BY stat_id, chger_id
        ORDER BY total DESC`,
      [statIds]
    );
    const perCharger = rankRes.rows.map(r => ({
      key: `${r.stat_id}_${r.chger_id}`,
      count: Number(r.total),
    }));
    // 캐시된 스테이션 목록에서 미사용(카운트 0) 충전기도 순위에 포함
    const cachedStations = getCache().data?.stations || [];
    const existingKeys = new Set(perCharger.map(e => e.key));
    for (const s of cachedStations) {
      if (!statIds.includes(s.station.statId)) continue;
      for (const c of s.chargers) {
        const key = `${s.station.statId}_${c.chgerId}`;
        if (!existingKeys.has(key)) {
          perCharger.push({ key, count: 0 });
          existingKeys.add(key);
        }
      }
    }
    perCharger.sort((a, b) => b.count - a.count);
    const allTimeTotal = perCharger.reduce((s, e) => s + e.count, 0);

    // 2-b) 전일까지 누적 랭킹 — 오늘(KST) 제외해서 어제 끝 시점 순위 산출
    const prevRankRes = await pool.query(
      `SELECT stat_id, chger_id, SUM(LEAST(count, 1))::bigint AS total
         FROM charger_usage_daily
        WHERE stat_id = ANY($1)
          AND date < ((NOW() AT TIME ZONE 'Asia/Seoul')::date)
        GROUP BY stat_id, chger_id`,
      [statIds]
    );
    const prevCountMap = new Map();
    for (const r of prevRankRes.rows) {
      prevCountMap.set(`${r.stat_id}_${r.chger_id}`, Number(r.total));
    }
    const prevEntries = perCharger.map(e => ({ key: e.key, count: prevCountMap.get(e.key) || 0 }));
    prevEntries.sort((a, b) => b.count - a.count);
    // 경쟁 순위 (1, 2, 2, 4): 동점은 같은 등수
    const prevRankMap = new Map();
    {
      let rank = 0;
      let lastCount = null;
      for (let i = 0; i < prevEntries.length; i++) {
        const e = prevEntries[i];
        if (e.count !== lastCount) {
          rank = i + 1;
          lastCount = e.count;
        }
        prevRankMap.set(e.key, { rank, count: e.count });
      }
    }
    {
      let rank = 0;
      let lastCount = null;
      for (let i = 0; i < perCharger.length; i++) {
        const e = perCharger[i];
        if (e.count !== lastCount) {
          rank = i + 1;
          lastCount = e.count;
        }
        e.rank = rank;
        const prev = prevRankMap.get(e.key);
        if (!prev || prev.count === 0) {
          e.isNew = e.count > 0;
          e.delta = null;
          e.prevRank = null;
        } else {
          e.prevRank = prev.rank;
          e.delta = prev.rank - rank; // +는 상승, -는 하락
          e.isNew = false;
        }
      }
    }

    // 3) 전체 누적 시간대 히스토그램 — 1시간당 최대 1포인트 정규화 (동일 규칙)
    const hourlyAllRes = await pool.query(
      `SELECT hour, SUM(LEAST(count, 1))::bigint AS total
         FROM charger_usage_daily
        WHERE stat_id = ANY($1)
        GROUP BY hour`,
      [statIds]
    );
    const hourlyAllTime = new Array(24).fill(0);
    for (const r of hourlyAllRes.rows) {
      hourlyAllTime[Number(r.hour)] = Number(r.total);
    }

    // 4) 전체 누적 요일 히스토그램 — 일자별로 우선 집계 후 DoW 변환 (KST 기준 date)
    const dowAllRes = await pool.query(
      `SELECT EXTRACT(DOW FROM date)::int AS dow, SUM(LEAST(count, 1))::bigint AS total
         FROM charger_usage_daily
        WHERE stat_id = ANY($1)
        GROUP BY dow`,
      [statIds]
    );
    const dowAllTime = new Array(7).fill(0);
    for (const r of dowAllRes.rows) {
      dowAllTime[Number(r.dow)] = Number(r.total);
    }

    // 5) 마지막 피크 — 동시 사용 충전기 가짓수 최댓값, 동률이면 가장 최근
    //    PK가 (stat_id, chger_id, date, hour)라 row 1개 = 충전기 1대가 그 시간에 사용됨
    const peakRes = await pool.query(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date_str, hour, COUNT(*)::int AS active
         FROM charger_usage_daily
        WHERE stat_id = ANY($1)
        GROUP BY date, hour
        ORDER BY active DESC, date DESC, hour DESC
        LIMIT 1`,
      [statIds]
    );
    const lastPeak = peakRes.rows[0]
      ? { date: peakRes.rows[0].date_str, hour: Number(peakRes.rows[0].hour), count: Number(peakRes.rows[0].active) }
      : null;

    return {
      hourly,
      hourlyAllTime,
      dow,
      dowAllTime,
      perCharger,
      total: periodTotal,
      daysCovered: dateSet.size,
      allTimeTotal,
      months: clampMonths,
      lastPeak,
    };
  } catch (e) {
    console.warn('[home-charger] fleet stats failed:', e.message);
    return empty;
  }
}
