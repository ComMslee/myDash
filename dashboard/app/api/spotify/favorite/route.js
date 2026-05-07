import { requireAuth, assertSameOrigin } from '@/lib/auth-helper';
import { toggleFavorite } from '@/lib/spotify/client';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const __csrf = assertSameOrigin(req);
  if (__csrf) return __csrf;

  try {
    const body = await req.json().catch(() => ({}));
    const { trackId, currently } = body;
    if (typeof trackId !== 'string' || !trackId) {
      return Response.json({ error: 'invalid_trackId' }, { status: 400 });
    }

    const result = await toggleFavorite(trackId, !!currently);
    if (!result.ok) {
      return Response.json({ error: result.error, status: result.status }, { status: result.status || 500 });
    }
    return Response.json({ ok: true, isFavorite: result.isFavorite });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
