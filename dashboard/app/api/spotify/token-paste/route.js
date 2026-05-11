import { requireAuth, assertSameOrigin } from '@/lib/auth-helper';
import { setRefreshToken } from '@/lib/spotify/store';
import { invalidateToken } from '@/lib/spotify/tokens';

export const dynamic = 'force-dynamic';

// 로컬에서 scripts/spotify-bootstrap.mjs 로 받은 refresh_token 을 prod 에 paste 저장.
// 저장 전 Spotify token endpoint 로 1회 refresh 시도하여 유효성 검증 — 잘못된 토큰 박제 방지.
export async function POST(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const __csrf = assertSameOrigin(req);
  if (__csrf) return __csrf;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return Response.json({ error: 'env_missing' }, { status: 500 });
  }

  let body;
  try { body = await req.json(); } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
  const token = (body?.refresh_token || '').trim();
  if (!token || token.length < 20 || token.length > 1024) {
    return Response.json({ error: 'invalid_token_format' }, { status: 400 });
  }

  // 1회 refresh 시도 — 유효해야만 저장
  try {
    const resp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: token }),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      return Response.json({ error: `spotify_${resp.status}`, detail: detail.slice(0, 300) }, { status: 400 });
    }
    const data = await resp.json();
    // Spotify 가 새 refresh_token 을 끼워주면 그걸 저장 (rotation), 아니면 paste 한 그대로
    const finalToken = data.refresh_token || token;
    await setRefreshToken(finalToken);
    invalidateToken();
    return Response.json({ ok: true, scope: data.scope, rotated: !!data.refresh_token });
  } catch (e) {
    return Response.json({ error: 'exchange_failed', detail: String(e?.message || e).slice(0, 300) }, { status: 500 });
  }
}
