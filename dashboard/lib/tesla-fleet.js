// Tesla Fleet API 클라이언트 — DB 저장 토큰 + 자동 refresh.
// ENV TESLA_FLEET_API_ENABLED=true 일 때만 실호출. 기본 false 면 schedule-runner 가 dry_run 처리.
//
// 토큰 발급/페어링: /api/tesla/oauth/start → callback 으로 자동 저장.
// 차량 ID: dash_settings.tesla_vehicle_id 또는 ENV TESLA_VEHICLE_ID. 미설정 시 첫 차량 자동 선택.

import { getAccessToken } from '@/lib/tesla-tokens';
import { getSetting, setSetting } from '@/lib/queries/schedules';

const TESLA_API_BASE = process.env.TESLA_FLEET_API_BASE || 'https://fleet-api.prd.na.vn.cloud.tesla.com';

async function vehicleId() {
  // 우선순위: 명시 ENV > DB 저장 > 자동탐지(첫 차량)
  if (process.env.TESLA_VEHICLE_ID) return process.env.TESLA_VEHICLE_ID;
  const stored = await getSetting('tesla_vehicle_id', null);
  if (stored) return stored;

  // 자동 탐지: /api/1/vehicles 호출해서 첫 차량 id 가져옴
  const list = await listVehicles();
  const first = list?.response?.[0];
  if (first?.id) {
    await setSetting('tesla_vehicle_id', String(first.id));
    return String(first.id);
  }
  throw new Error('No Tesla vehicle found on account');
}

async function teslaFetch(path, init = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${TESLA_API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      ...(init.body && !init.headers?.['Content-Type'] ? { 'Content-Type': 'application/json' } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

export async function listVehicles() {
  const r = await teslaFetch('/api/1/vehicles');
  if (!r.ok) throw new Error(`listVehicles HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`);
  return r.body;
}

// callTeslaCommand — 차량 명령 1건.
// command: 'set_charge_limit' | 'auto_conditioning_start' | 'door_lock' | ...
// returns: { ok, status, body, wake_required?, error? }
export async function callTeslaCommand(command, params = {}) {
  const vid = await vehicleId();
  const r = await teslaFetch(`/api/1/vehicles/${vid}/command/${command}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (r.ok) return { ok: true, status: r.status, body: r.body };

  const errStr = r.body?.error || r.body?.response?.reason || '';
  // 차량 sleep → unavailable. wake_up 후 1회 재시도.
  if (r.status === 408 || r.status === 503 || /unavailable|asleep/i.test(errStr)) {
    const woke = await callTeslaWake().catch(() => null);
    if (woke?.ok) {
      const r2 = await teslaFetch(`/api/1/vehicles/${vid}/command/${command}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      return { ok: r2.ok, status: r2.status, body: r2.body, wake_required: true };
    }
    return { ok: false, status: r.status, body: r.body, error: errStr || `HTTP ${r.status}`, wake_required: true };
  }
  return { ok: false, status: r.status, body: r.body, error: errStr || `HTTP ${r.status}` };
}

export async function callTeslaWake() {
  const vid = await vehicleId();
  return teslaFetch(`/api/1/vehicles/${vid}/wake_up`, { method: 'POST' });
}

export async function callTeslaVehicleData() {
  const vid = await vehicleId();
  return teslaFetch(`/api/1/vehicles/${vid}/vehicle_data`);
}
