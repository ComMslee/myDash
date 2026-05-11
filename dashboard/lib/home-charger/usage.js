// 충전기 사용 카운트 기록/조회 — 30분당 최대 1회 증가 룰.
// charger_usage:        시간대(0~23) PK, 누적 (메인 카드 점등용)
// charger_usage_daily:  (date, hour) PK, 기간 필터·랭킹·히트맵용

import pool from '@/lib/db';
import { kstDateStr, KST_OFFSET_MS } from '@/lib/kst';
import { ensureTable } from './schema';

// 30분당 최대 1회 증가 — 같은 (stat_id, chger_id, hour) 버킷은 30분 간격으로 +1
// 직전 업데이트로부터 30분 미경과면 스킵 (시간당 최대 2, 하루 최대 48)
// daily 테이블에도 같은 30분 룰로 (date, hour) 단위 기록
export async function recordUsageDb(stations) {
  try {
    await ensureTable();
    const now = Date.now();
    const kstHour = new Date(now + KST_OFFSET_MS).getUTCHours();
    const kstDate = kstDateStr(now);
    const rows = stations.flatMap(s =>
      s.chargers.filter(c => c.stat === '3').map(c => [s.station.statId, c.chgerId])
    );
    if (!rows.length) return;
    const statIds  = rows.map(r => r[0]);
    const chgerIds = rows.map(r => r[1]);
    await pool.query(
      `INSERT INTO charger_usage (stat_id, chger_id, hour, count)
       SELECT unnest($1::text[]), unnest($2::text[]), $3::smallint, 1
       ON CONFLICT (stat_id, chger_id, hour) DO UPDATE
         SET count = charger_usage.count + 1,
             updated_at = NOW()
         WHERE charger_usage.updated_at < NOW() - INTERVAL '30 minutes'`,
      [statIds, chgerIds, kstHour]
    );
    await pool.query(
      `INSERT INTO charger_usage_daily (stat_id, chger_id, date, hour, count)
       SELECT unnest($1::text[]), unnest($2::text[]), $3::date, $4::smallint, 1
       ON CONFLICT (stat_id, chger_id, date, hour) DO UPDATE
         SET count = charger_usage_daily.count + 1,
             updated_at = NOW()
         WHERE charger_usage_daily.updated_at < NOW() - INTERVAL '30 minutes'`,
      [statIds, chgerIds, kstDate, kstHour]
    );
  } catch (e) {
    console.warn('[home-charger] usage record failed:', e.message);
  }
}

// statIds 배열로 조회, 반환 키는 "statId_chgerId"
// charger_usage_daily를 시간당 최대 1포인트로 정규화 — 팝업 랭킹과 동일 기준
export async function fetchUsageDb(statIds) {
  try {
    await ensureTable();
    if (!statIds.length) return {};
    const res = await pool.query(
      `SELECT stat_id, chger_id, hour, SUM(LEAST(count, 1))::int AS count
         FROM charger_usage_daily
        WHERE stat_id = ANY($1)
        GROUP BY stat_id, chger_id, hour`,
      [statIds]
    );
    const usage = {};
    for (const row of res.rows) {
      const key = `${row.stat_id}_${row.chger_id}`;
      if (!usage[key]) usage[key] = { h: new Array(24).fill(0), t: 0 };
      usage[key].h[row.hour] = Number(row.count);
      usage[key].t += Number(row.count);
    }
    return usage;
  } catch (e) {
    console.warn('[home-charger] usage fetch failed:', e.message);
    return {};
  }
}
