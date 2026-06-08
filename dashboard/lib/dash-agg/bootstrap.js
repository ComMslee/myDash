import pool from '@/lib/db';
import { KST_OFFSET_MS } from '@/lib/kst';
import { refreshRange } from './daily';
import { refreshMonthlyInsights } from './monthly';
import { refreshTopDrivesCache } from './top';
import { refreshPlaceClusters } from './places';

// 같은 컨테이너 라이프타임에서 한 번만 (inflight Promise 로 dedup).
let bootstrapInflight = null;

// bootstrapIfEmpty — ensureSchema 후 호출. 4개 사전집계가 비어 있는 것만 풀 백필.
// 첫 요청 10~60초, 이후 즉시. cron 이 도는 동안에는 항상 채워져 있어 노옵.
export async function bootstrapIfEmpty(carId) {
  if (!carId) return null;
  if (bootstrapInflight) return bootstrapInflight;
  bootstrapInflight = (async () => {
    try {
      const earliest = await pool.query(
        `SELECT LEAST(
           (SELECT MIN(start_date) FROM drives WHERE car_id = $1),
           (SELECT MIN(start_date) FROM charging_processes WHERE car_id = $1)
         ) AS first_ts`,
        [carId]
      );
      const firstTs = earliest.rows[0]?.first_ts;
      if (!firstTs) return { ok: true, empty_history: true };

      const firstKst = new Date(new Date(firstTs).getTime() + KST_OFFSET_MS);
      const fromStr = `${firstKst.getUTCFullYear()}-${String(firstKst.getUTCMonth() + 1).padStart(2, '0')}-01`;

      const kstNow = new Date(Date.now() + KST_OFFSET_MS);
      const tomorrowKst = new Date(Date.UTC(
        kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate() + 1
      ));
      const toStr = tomorrowKst.toISOString().slice(0, 10);

      // 4 테이블 비어있는지 체크는 가벼운 쿼리라 병렬 실행
      const checkSql = (table) =>
        pool.query(`SELECT 1 FROM ${table} WHERE car_id = $1 LIMIT 1`, [carId]);
      // monthly는 "비어있나" 대신 "gap 있나" — row가 일부만 있어도 누락 월 감지
      const monthlyGapChk = pool.query(
        `SELECT COUNT(*)::int AS gap_count
         FROM (
           SELECT DISTINCT
             EXTRACT(YEAR  FROM start_date + INTERVAL '9 hours')::int AS yr,
             EXTRACT(MONTH FROM start_date + INTERVAL '9 hours')::int AS mo
           FROM drives WHERE car_id = $1
           UNION
           SELECT DISTINCT
             EXTRACT(YEAR  FROM start_date + INTERVAL '9 hours')::int,
             EXTRACT(MONTH FROM start_date + INTERVAL '9 hours')::int
           FROM charging_processes WHERE car_id = $1 AND charge_energy_added IS NOT NULL
         ) all_months
         LEFT JOIN dash_monthly_insights dmi
           ON dmi.car_id = $1 AND dmi.year = all_months.yr AND dmi.month = all_months.mo
         WHERE dmi.year IS NULL`,
        [carId]
      );
      const [dailyChk, topChk, placesChk, monthlyGap] = await Promise.all([
        checkSql('dash_daily_drive_agg'),
        checkSql('dash_top_drives_cache'),
        checkSql('dash_place_clusters'),
        monthlyGapChk,
      ]);

      const out = { from: fromStr, to: toStr };
      if (dailyChk.rows.length === 0) {
        out.daily = await refreshRange(carId, fromStr, toStr);
      }
      if (monthlyGap.rows[0].gap_count > 0) {
        // gap 있는 월 포함 전체 히스토리 재집계 (최대 240개월)
        out.monthly = await refreshMonthlyInsights(carId, fromStr, toStr, 240);
        out.monthly_gap_fixed = monthlyGap.rows[0].gap_count;
      }
      if (topChk.rows.length === 0) {
        out.top = await refreshTopDrivesCache(carId);
      }
      if (placesChk.rows.length === 0) {
        out.places = await refreshPlaceClusters(carId);
      }
      return out;
    } catch (err) {
      console.error('[dash-agg] bootstrap error:', err);
      throw err;
    }
  })();
  try {
    return await bootstrapInflight;
  } finally {
    bootstrapInflight = null;
  }
}
