import { requireAuth } from '@/lib/auth-helper';
import { callTeslaVehicleData } from '@/lib/tesla-fleet';

export const dynamic = 'force-dynamic';

// GET /api/tesla-test/ping — Tesla Fleet API connectivity 테스트.
// ENABLED=false 또는 토큰 미설정 → 에러로 즉시 회신 (실호출 0).
// ENABLED=true 인 경우 vehicle_data 1회 호출 — Fleet API 단가 $0.002.
//
// 응답 형식:
//   { enabled: bool, tokenMissing: bool, vehicleIdMissing: bool, ok?: bool, status?: number, summary?: {...} }
//
// 사용자가 한 번 누를 때만 실호출 — 캐시/주기 호출 X.
export async function GET() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const enabled = process.env.TESLA_FLEET_API_ENABLED === 'true';
  const tokenMissing = !process.env.TESLA_FLEET_ACCESS_TOKEN;
  const vehicleIdMissing = !process.env.TESLA_VEHICLE_ID;

  if (!enabled) {
    return Response.json({
      enabled: false,
      tokenMissing, vehicleIdMissing,
      note: 'TESLA_FLEET_API_ENABLED != "true" — Mock 모드. 실호출 안 함.',
    });
  }
  if (tokenMissing || vehicleIdMissing) {
    return Response.json({
      enabled: true, tokenMissing, vehicleIdMissing,
      note: '토큰 또는 vehicle id 미설정. OAuth 완료 후 환경변수 설정 필요.',
    }, { status: 412 });
  }

  try {
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
      enabled: true, tokenMissing: false, vehicleIdMissing: false,
      ok: r.ok, status: r.status, summary,
      cost_estimate: r.ok ? 0.002 : 0,
    });
  } catch (e) {
    return Response.json({
      enabled: true, tokenMissing: false, vehicleIdMissing: false,
      ok: false, error: e?.message || 'unknown',
    }, { status: 500 });
  }
}
