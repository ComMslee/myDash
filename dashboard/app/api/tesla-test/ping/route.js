import { requireAuth } from '@/lib/auth-helper';
import { callTeslaVehicleData, listVehicles } from '@/lib/tesla-fleet';
import { getConnectionStatus } from '@/lib/tesla-tokens';

export const dynamic = 'force-dynamic';

// GET /api/tesla-test/ping — Tesla Fleet API connectivity 테스트.
// ENABLED=false → Mock. ENABLED=true → vehicle_data 1회 실호출 ($0.002).
// 토큰은 DB 저장 (OAuth 통해 발급). 차량 id 는 첫 차량 자동 선택.
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
    // 첫 호출: vehicles 목록 (vehicle_id 자동 저장) — 무료(목록은 단가 0 또는 매우 낮음).
    const vehicles = await listVehicles().catch(() => null);
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
    return Response.json({
      enabled: true, tokenMissing: false,
      vehicles_count: vehicles?.response?.length || 0,
      ok: r.ok, status: r.status, summary,
      cost_estimate: r.ok ? 0.002 : 0,
    });
  } catch (e) {
    return Response.json({
      enabled: true, tokenMissing: false,
      ok: false, error: e?.message || 'unknown',
    }, { status: 500 });
  }
}
