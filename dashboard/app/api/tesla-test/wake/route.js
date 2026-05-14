import { requireAuth } from '@/lib/auth-helper';
import { callTeslaWake } from '@/lib/tesla-fleet';
import { getConnectionStatus } from '@/lib/tesla-tokens';
import { logExecution, calcCost } from '@/lib/queries/schedules';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/tesla-test/wake — 차량 깨우기 테스트 (wake_up command).
// ENABLED=true + 토큰 있어야 실호출. wake_up 자체는 무료(commands 만 과금).
export async function POST() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const enabled = process.env.TESLA_FLEET_API_ENABLED === 'true';
  const status = await getConnectionStatus();
  if (!enabled) {
    return Response.json({ enabled: false, note: 'TESLA_FLEET_API_ENABLED != "true" — Mock 모드.' });
  }
  if (!status.connected) {
    return Response.json({ enabled: true, tokenMissing: true, note: 'Tesla OAuth 미완료.' }, { status: 412 });
  }
  try {
    const r = await callTeslaWake();
    const state = r?.body?.response?.state;
    const apiCalls = { wakes: 1 };
    const cost = calcCost(apiCalls);
    await logExecution({
      schedule_id: null,
      trigger_source: 'manual_test',
      action: 'wake_up',
      action_params: {},
      status: r.ok ? 'success' : 'failed',
      reason: r.ok ? null : `HTTP ${r.status}`,
      api_calls: apiCalls,
      tesla_response: { state },
      cost_estimate: cost,
    }).catch(() => null);
    return Response.json({ ok: r.ok, status: r.status, state, cost_estimate: cost, note: r.ok ? '깨우기 명령 전송됨 (실제 깨어나는데 ~30초 소요)' : 'wake_up 실패' });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || 'unknown' }, { status: 500 });
  }
}
