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

// 405 전 인증 가드 — 미인증 사용자에게 정보 노출(라우트 존재 여부) 방지, 다른 라우트와 일관성 유지.
export async function POST() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  return Response.json(
    { error: '지오펜스 추가는 TeslaMate UI 에서 처리합니다.' },
    { status: 405 },
  );
}
