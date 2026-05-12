import { requireAuth } from '@/lib/auth-helper';
import { getDefaultCar } from '@/lib/queries/car';
import { ensureSchema, refreshRange } from '@/lib/dash-agg';
import { invalidate } from '@/lib/server-cache';

export const dynamic = 'force-dynamic';

// POST /api/admin/refresh-aggs
// Body/query: days (default 7), carId (default = getDefaultCar().id)
//
// 매일 KST 04:00 GHA cron 으로 호출 (refresh-aggs.yml). 최근 7일을 항상 reprocess →
// 어제 누락 / cron 실패 시 self-heal. 오늘 데이터까지 포함 upsert (다음 cron 이 다시 덮어쓰므로 OK).
export async function POST(request) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;

  try {
    const url = new URL(request.url);
    let body = {};
    try { body = await request.json(); } catch { /* no body */ }

    const daysRaw = body.days ?? url.searchParams.get('days');
    const days = Math.max(1, parseInt(daysRaw ?? '7', 10) || 7);

    let carId = body.carId ?? url.searchParams.get('carId');
    if (carId != null) carId = parseInt(carId, 10);
    if (!carId) {
      const car = await getDefaultCar();
      if (!car) return Response.json({ error: 'No car found' }, { status: 404 });
      carId = car.id;
    }

    // KST 기준 today (00:00 KST = UTC 15:00 전날). day 컬럼은 KST date 이므로
    // JS Date 의 UTC 기준을 보정해서 KST 날짜 산출.
    const nowUtcMs = Date.now();
    const kstNow = new Date(nowUtcMs + 9 * 60 * 60 * 1000);
    const todayKst = new Date(Date.UTC(
      kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()
    ));
    const fromKst = new Date(todayKst.getTime() - days * 24 * 60 * 60 * 1000);
    const toKst   = new Date(todayKst.getTime() + 1 * 24 * 60 * 60 * 1000); // 오늘+1 (제외)

    const fromStr = fromKst.toISOString().slice(0, 10);
    const toStr   = toKst.toISOString().slice(0, 10);

    await ensureSchema();
    const result = await refreshRange(carId, fromStr, toStr);

    // 사전 집계가 갱신됐으므로 관련 라우트 캐시 일괄 무효화
    invalidate('insights:');
    invalidate('charge-all-time:');
    invalidate('monthly-history:');

    return Response.json({
      ok: true,
      car_id: carId,
      days,
      from: fromStr,
      to: toStr,
      drive_rows: result.drive_rows,
      charge_rows: result.charge_rows,
      ms: result.ms,
    });
  } catch (err) {
    console.error('/api/admin/refresh-aggs error:', err);
    return Response.json({ error: 'refresh_failed', message: err.message }, { status: 500 });
  }
}
