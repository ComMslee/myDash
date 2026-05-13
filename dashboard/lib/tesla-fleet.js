// Tesla Fleet API 클라이언트 — Mock + Real 토글.
// ENV TESLA_FLEET_API_ENABLED=true 일 때만 실호출. 기본 false 면 schedule-runner 가 dry_run 처리.
// 본 파일은 ENABLED=true 일 때 호출되는 실제 API 래퍼.
//
// 참고: 토큰 발급/페어링은 별도 OAuth flow 필요 — 다음 단계 (실연동 시) 구현.
//      현재는 ENABLED=true 여도 토큰 미설정이면 401 응답으로 명확히 실패.

const TESLA_API_BASE = process.env.TESLA_FLEET_API_BASE || 'https://fleet-api.prd.na.vn.cloud.tesla.com';
const VEHICLE_ID = process.env.TESLA_VEHICLE_ID || '';
const TOKEN = process.env.TESLA_FLEET_ACCESS_TOKEN || '';

async function ensureToken() {
  if (!TOKEN) throw new Error('TESLA_FLEET_ACCESS_TOKEN not set');
  if (!VEHICLE_ID) throw new Error('TESLA_VEHICLE_ID not set');
  // TODO: refresh token rotation (refresh_token → access_token 갱신). 실연동 단계에서 구현.
  return TOKEN;
}

// callTeslaCommand — 차량 명령 1건.
// command: 'set_sentry_mode' | 'auto_conditioning_start' | 'door_lock' | ...
// params: 명령별 인자
// returns: { ok: bool, status: number, body: any, wake_required?: bool, error?: string }
export async function callTeslaCommand(command, params = {}) {
  const token = await ensureToken();
  const url = `${TESLA_API_BASE}/api/1/vehicles/${VEHICLE_ID}/command/${command}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    return { ok: false, error: `network: ${e?.message || 'unknown'}` };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // 차량이 sleep 이면 Tesla 가 자동 wake 처리 — 408/503 응답 후 재시도로 처리하는 패턴.
    // 첫 호출 fail + 응답이 'vehicle_unavailable' 이면 wake 후 재호출 1회.
    if (body?.error?.includes?.('unavailable') || res.status === 408 || res.status === 503) {
      const woke = await callTeslaWake().catch(() => null);
      // wake API 호출 자체에 비용 발생 — 시도했으면 wake_required:true 로 누적 보장
      // (성공/실패 무관 — schedule-runner 가 wakes 카운트 누적).
      if (woke?.ok) {
        // 깨운 후 재호출
        const r2 = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
          signal: AbortSignal.timeout(15_000),
        });
        const body2 = await r2.json().catch(() => null);
        return { ok: r2.ok, status: r2.status, body: body2, wake_required: true };
      }
      return { ok: false, status: res.status, body, error: body?.error || `HTTP ${res.status}`, wake_required: true };
    }
    return { ok: false, status: res.status, body, error: body?.error || `HTTP ${res.status}` };
  }
  return { ok: true, status: res.status, body };
}

export async function callTeslaWake() {
  const token = await ensureToken();
  const url = `${TESLA_API_BASE}/api/1/vehicles/${VEHICLE_ID}/wake_up`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

// callTeslaVehicleData — 차량 상태 폴링 ($0.002/호출). 즉시 패널의 현재 상태 동기화용.
export async function callTeslaVehicleData() {
  const token = await ensureToken();
  const url = `${TESLA_API_BASE}/api/1/vehicles/${VEHICLE_ID}/vehicle_data`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}
