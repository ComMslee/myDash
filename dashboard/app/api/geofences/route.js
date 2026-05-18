import { requireAuth } from '@/lib/auth-helper';
import { listGeofences } from '@/lib/queries/schedules';

export const dynamic = 'force-dynamic';

// GET /api/geofences — TeslaMate `geofences` 테이블 read-only 미러.
// 추가·수정·삭제는 TeslaMate UI 에서 처리 (단일 진실원).
export async function GET() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const rows = await listGeofences();
  return Response.json({ geofences: rows, source: 'teslamate', readonly: true });
}

export async function POST() {
  return Response.json(
    { error: '지오펜스 추가는 TeslaMate UI 에서 처리합니다.' },
    { status: 405 },
  );
}
