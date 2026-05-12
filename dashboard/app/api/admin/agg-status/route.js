import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { ensureSchema } from '@/lib/dash-agg';
import { cacheStats } from '@/lib/server-cache';

export const dynamic = 'force-dynamic';

// GET /api/admin/agg-status — 사전집계 6 테이블 + server-cache 진단
//
// 응답:
//   {
//     ok: true,
//     now: ISO,
//     tables: [{ name, rows, meta: { ... } }],
//     server_cache: [{ key, ageMs, ttlMs, fresh, sizeApprox }]
//   }
//
// /v2/dev/api-status 의 "집계" 탭이 사용. read-only 이지만 PIN 세션 동일 정책.
export async function GET() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;

  try {
    await ensureSchema();

    const queries = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS rows, MIN(day) AS min_day, MAX(day) AS max_day FROM dash_daily_drive_agg`),
      pool.query(`SELECT COUNT(*)::int AS rows, MIN(day) AS min_day, MAX(day) AS max_day FROM dash_daily_charge_agg`),
      pool.query(`SELECT COUNT(*)::int AS rows, MIN(year*100+month) AS min_ym, MAX(year*100+month) AS max_ym FROM dash_monthly_insights`),
      pool.query(`SELECT COUNT(*)::int AS rows, MAX(start_date) AS latest FROM dash_top_drives_cache`),
      pool.query(`SELECT COUNT(*)::int AS rows, MAX(last_visited_at) AS latest, COALESCE(SUM(visit_count), 0)::int AS total_visits FROM dash_place_clusters`),
      pool.query(`SELECT COUNT(*)::int AS rows, MAX(updated_at) AS latest FROM dash_place_geo`),
    ]);

    const [drive, charge, monthly, top, places, geo] = queries.map(q => q.rows[0]);

    const tables = [
      { name: 'dash_daily_drive_agg',  scope: 'daily',   rows: drive.rows,
        meta: { min_day: drive.min_day, max_day: drive.max_day } },
      { name: 'dash_daily_charge_agg', scope: 'daily',   rows: charge.rows,
        meta: { min_day: charge.min_day, max_day: charge.max_day } },
      { name: 'dash_monthly_insights', scope: 'monthly', rows: monthly.rows,
        meta: { min_ym: monthly.min_ym, max_ym: monthly.max_ym } },
      { name: 'dash_top_drives_cache', scope: 'top',     rows: top.rows,
        meta: { latest: top.latest } },
      { name: 'dash_place_clusters',   scope: 'places',  rows: places.rows,
        meta: { latest: places.latest, total_visits: places.total_visits } },
      { name: 'dash_place_geo',        scope: 'places',  rows: geo.rows,
        meta: { latest: geo.latest } },
    ];

    return Response.json({
      ok: true,
      now: new Date().toISOString(),
      tables,
      server_cache: cacheStats(),
    });
  } catch (err) {
    console.error('/api/admin/agg-status error:', err);
    return Response.json({ error: 'status_failed', message: err.message }, { status: 500 });
  }
}
