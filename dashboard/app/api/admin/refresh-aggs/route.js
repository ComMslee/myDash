import { requireAuth } from '@/lib/auth-helper';
import { getDefaultCar } from '@/lib/queries/car';
import {
  ensureSchema,
  refreshRange,
  refreshMonthlyInsights,
  refreshTopDrivesCache,
  refreshPlaceClusters,
  bootstrapIfEmpty,
} from '@/lib/dash-agg';
import { invalidate } from '@/lib/server-cache';
import { KST_OFFSET_MS } from '@/lib/kst';
import { AGG_SCOPE_KEYS } from '@/lib/agg-scopes';

export const dynamic = 'force-dynamic';

// POST /api/admin/refresh-aggs?scope=daily|monthly|top|places|all
// Body/query: days (default 7), carId, scope (default 'all'), monthsBack (default 24)
//
// 매일 KST 04:00 GHA cron 으로 호출 (refresh-aggs.yml). scope=all 이면 4 테이블 모두 갱신.
export async function POST(request) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;

  try {
    const url = new URL(request.url);
    let body = {};
    try { body = await request.json(); } catch { /* no body */ }

    const daysRaw = body.days ?? url.searchParams.get('days');
    const days = Math.max(1, parseInt(daysRaw ?? '7', 10) || 7);
    const scope = (body.scope ?? url.searchParams.get('scope') ?? 'all').toLowerCase();
    if (!AGG_SCOPE_KEYS.includes(scope)) {
      return Response.json({ error: 'invalid_scope', allowed: AGG_SCOPE_KEYS }, { status: 400 });
    }
    const monthsBack = Math.max(1, parseInt(body.monthsBack ?? url.searchParams.get('monthsBack') ?? '24', 10) || 24);

    let carId = body.carId ?? url.searchParams.get('carId');
    if (carId != null) carId = parseInt(carId, 10);
    if (!carId) {
      const car = await getDefaultCar();
      if (!car) return Response.json({ error: 'No car found' }, { status: 404 });
      carId = car.id;
    }

    const kstNow = new Date(Date.now() + KST_OFFSET_MS);
    const todayKst = new Date(Date.UTC(
      kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()
    ));
    const fromKst = new Date(todayKst.getTime() - days * 24 * 60 * 60 * 1000);
    const toKst   = new Date(todayKst.getTime() + 1 * 24 * 60 * 60 * 1000); // 오늘+1 (제외)
    const monthlyFromKst = new Date(Date.UTC(
      kstNow.getUTCFullYear(), kstNow.getUTCMonth() - (monthsBack - 1), 1
    ));

    const fromStr = fromKst.toISOString().slice(0, 10);
    const toStr   = toKst.toISOString().slice(0, 10);
    const monthlyFromStr = monthlyFromKst.toISOString().slice(0, 10);

    await ensureSchema();
    // 비어 있으면 풀 백필 (첫 배포 직후 수동 트리거 시 핵심) — 이미 채워져 있으면 즉시 통과
    const bootstrap = await bootstrapIfEmpty(carId);

    const out = { ok: true, car_id: carId, scope, from: fromStr, to: toStr, bootstrap };

    if (scope === 'all' || scope === 'daily') {
      const r = await refreshRange(carId, fromStr, toStr);
      out.daily = r;
    }
    if (scope === 'all' || scope === 'monthly') {
      const r = await refreshMonthlyInsights(carId, monthlyFromStr, toStr, monthsBack + 1);
      out.monthly = { ...r, from: monthlyFromStr };
    }
    if (scope === 'all' || scope === 'top') {
      out.top = await refreshTopDrivesCache(carId);
    }
    if (scope === 'all' || scope === 'places') {
      out.places = await refreshPlaceClusters(carId);
    }

    // 사전 집계가 갱신됐으므로 관련 라우트 캐시 일괄 무효화
    invalidate('insights:');
    invalidate('charge-all-time:');
    invalidate('monthly-history:');
    invalidate('summary:');
    invalidate('rankings:');
    invalidate('frequent-places:');

    return Response.json(out);
  } catch (err) {
    console.error('/api/admin/refresh-aggs error:', err);
    return Response.json({ error: 'refresh_failed', message: err.message }, { status: 500 });
  }
}
