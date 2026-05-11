import { requireAuth } from '@/lib/auth-helper';
import { getTokenInfo } from '@/lib/spotify/store';
import { getTokenStatus } from '@/lib/spotify/tokens';

export const dynamic = 'force-dynamic';

// 재인증 페이지 표시용 — DB 저장 여부, 마지막 갱신 시각, 메모리 access_token 상태.
export async function GET() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;

  try {
    const stored = await getTokenInfo();
    const memory = getTokenStatus();
    return Response.json({ stored, memory });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
