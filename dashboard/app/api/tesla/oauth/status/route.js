import { requireAuth } from '@/lib/auth-helper';
import { getConnectionStatus, clearTokens } from '@/lib/tesla-tokens';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET — Tesla Fleet API 연결 상태 (토큰 존재/만료/scope).
export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const s = await getConnectionStatus();
  return Response.json(s);
}

// DELETE — 저장된 토큰 폐기 (재연결 강제).
export async function DELETE() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  await clearTokens();
  return Response.json({ ok: true });
}
