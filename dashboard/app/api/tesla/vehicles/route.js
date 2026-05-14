import { requireAuth } from '@/lib/auth-helper';
import { listVehicles } from '@/lib/tesla-fleet';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/tesla/vehicles — Fleet API 로 차량 목록 조회 (ENABLED 무관, 토큰만 있으면 동작).
// 차량 등록 직후 vehicle_id / VIN 확인용. 목록 조회 비용은 단가 책정에 안 잡힘 (commands 만 과금).
export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  try {
    const r = await listVehicles();
    return Response.json({ ok: true, vehicles: r?.response || [] });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || 'unknown' }, { status: 500 });
  }
}
