import { requireAuth, assertSameOrigin } from '@/lib/auth-helper';
import { controlPlayback } from '@/lib/spotify/client';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const __csrf = assertSameOrigin(req);
  if (__csrf) return __csrf;

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    if (!['play', 'pause', 'next', 'previous'].includes(action)) {
      return Response.json({ error: 'invalid_action' }, { status: 400 });
    }

    const result = await controlPlayback(action);
    if (!result.ok) {
      // 403: 디바이스 active 가 아니거나 Free 계정 — UI 에서 안내 가능하도록 status 그대로
      return Response.json({ error: result.error, status: result.status }, { status: result.status || 500 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
