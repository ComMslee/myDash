import { requireAuth, assertSameOrigin } from '@/lib/auth-helper';
import { seekToPosition } from '@/lib/spotify/client';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const __csrf = assertSameOrigin(req);
  if (__csrf) return __csrf;

  try {
    const body = await req.json().catch(() => ({}));
    const positionMs = Number(body?.positionMs);
    if (!Number.isFinite(positionMs) || positionMs < 0) {
      return Response.json({ error: 'invalid_position' }, { status: 400 });
    }

    const result = await seekToPosition(positionMs);
    if (!result.ok) {
      return Response.json({ error: result.error, status: result.status }, { status: result.status || 500 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
