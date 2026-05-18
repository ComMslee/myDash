import { requireAuth } from '@/lib/auth-helper';
import { callTeslaVehicleData, callTeslaVehicleSummary, listVehicles } from '@/lib/tesla-fleet';
import { getConnectionStatus } from '@/lib/tesla-tokens';
import { logExecution, calcCost } from '@/lib/queries/schedules';

export const dynamic = 'force-dynamic';

// GET /api/tesla-test/ping — Tesla Fleet API connectivity 테스트.
// 1) listVehicles + 단일 차량 summary 로 state 확인 (asleep/online/offline) — 무료, 차 안 깨움.
// 2) state==='online' 이면 vehicle_data 1회 실호출 ($0.002) — 배터리/주행거리/Sentry/버전 포함.
// 3) asleep/offline 이면 vehicle_data 안 부르고 state 만 반환 — '깨우기' 버튼 안내.
export async function GET() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const enabled = process.env.TESLA_FLEET_API_ENABLED === 'true';
  const status = await getConnectionStatus();
  const tokenMissing = !status.connected;

  if (!enabled) {
    return Response.json({
      enabled: false,
      tokenMissing,
      tokenExpiresAt: status.expires_at,
      note: 'TESLA_FLEET_API_ENABLED != "true" — Mock 모드. 실호출 안 함.',
    });
  }
  if (tokenMissing) {
    return Response.json({
      enabled: true, tokenMissing: true,
      note: 'Tesla OAuth 미완료. 설정 → 🔌 Tesla 연결 에서 먼저 인증.',
    }, { status: 412 });
  }

  try {
    const vehicles = await listVehicles().catch(() => null);
    const sum = await callTeslaVehicleSummary().catch(() => null);
    const state = sum?.body?.response?.state || null;
    const vin = sum?.body?.response?.vin || null;
    const displayName = sum?.body?.response?.display_name || null;

    // 자거나 오프라인이면 vehicle_data 호출 X — 차 안 깨움.
    if (state !== 'online') {
      // 호출 2회 발생 (vehicles list + single summary) — 비용 0.004
      const apiCalls = { vehicle_data: 2 };
      const cost = calcCost(apiCalls);
      await logExecution({
        schedule_id: null,
        trigger_source: 'manual_test',
        action: 'check_status',
        action_params: { state, vin },
        status: 'success',
        reason: state === 'asleep' ? 'sleep' : state === 'offline' ? 'offline' : state || 'unknown',
        api_calls: apiCalls,
        tesla_response: { state, vin, display_name: displayName, vehicles_count: vehicles?.response?.length || 0 },
        cost_estimate: cost,
      }).catch(() => null);
      return Response.json({
        enabled: true, tokenMissing: false,
        vehicles_count: vehicles?.response?.length || 0,
        ok: true, state, vin, display_name: displayName,
        summary: null,
        cost_estimate: cost,
        note: state === 'asleep' ? '차량 sleep 중 — "깨우기" 버튼 누른 후 다시 시도'
            : state === 'offline' ? '차량 offline (전원 차단/통신 두절)'
            : `차량 state=${state || 'unknown'} — vehicle_data 호출 안 함`,
      });
    }

    const r = await callTeslaVehicleData();
    const body = r?.body?.response || r?.body || null;
    const summary = body ? {
      vin: body.vin,
      state: body.state,
      car_version: body.vehicle_state?.car_version,
      battery_level: body.charge_state?.battery_level,
      sentry_mode: body.vehicle_state?.sentry_mode,
      odometer: body.vehicle_state?.odometer,
    } : null;
    // 호출 3회 (vehicles list + summary + vehicle_data) — 비용 0.006
    const apiCalls = { vehicle_data: 3 };
    const cost = calcCost(apiCalls);
    await logExecution({
      schedule_id: null,
      trigger_source: 'manual_test',
      action: 'check_status',
      action_params: { state, vin },
      status: r.ok ? 'success' : 'failed',
      reason: r.ok ? null : `HTTP ${r.status}`,
      api_calls: apiCalls,
      tesla_response: { summary, vehicles_count: vehicles?.response?.length || 0 },
      cost_estimate: cost,
    }).catch(() => null);
    return Response.json({
      enabled: true, tokenMissing: false,
      vehicles_count: vehicles?.response?.length || 0,
      ok: r.ok, status: r.status, state, vin, display_name: displayName, summary,
      cost_estimate: cost,
    });
  } catch (e) {
    return Response.json({
      enabled: true, tokenMissing: false,
      ok: false, error: e?.message || 'unknown',
    }, { status: 500 });
  }
}
