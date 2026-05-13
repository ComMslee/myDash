export const dynamic = 'force-dynamic';

// TeslaMate geofences 가 단일 진실원 — 수정/삭제는 TeslaMate UI 에서.
export async function PUT() {
  return Response.json(
    { error: '지오펜스 수정은 TeslaMate UI 에서 처리합니다.' },
    { status: 405 },
  );
}
export async function DELETE() {
  return Response.json(
    { error: '지오펜스 삭제는 TeslaMate UI 에서 처리합니다.' },
    { status: 405 },
  );
}
