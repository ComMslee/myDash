import { requireAuth } from '@/lib/auth-helper';

export const dynamic = 'force-dynamic';

// TeslaMate geofences 가 단일 진실원 — 수정/삭제는 TeslaMate UI 에서.
// 405 전 인증 가드 — 미인증 사용자에게 라우트 존재 여부 노출 방지.
export async function PUT() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  return Response.json(
    { error: '지오펜스 수정은 TeslaMate UI 에서 처리합니다.' },
    { status: 405 },
  );
}
export async function DELETE() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  return Response.json(
    { error: '지오펜스 삭제는 TeslaMate UI 에서 처리합니다.' },
    { status: 405 },
  );
}
