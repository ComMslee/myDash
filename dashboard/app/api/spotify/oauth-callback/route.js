import { NextResponse } from 'next/server';
import { setRefreshToken } from '@/lib/spotify/store';
import { invalidateToken } from '@/lib/spotify/tokens';

export const dynamic = 'force-dynamic';

// Spotify 가 OAuth 동의 후 redirect — code 교환 → refresh_token DB 저장.
// PKCE state cookie 매칭으로 위변조 검증.

function back(req, params) {
  const url = new URL(req.url);
  const proto = req.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || url.host;
  const u = new URL(`${proto}://${host}/dev/spotify-relogin`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = NextResponse.redirect(u.toString(), 302);
  for (const name of ['spt_oauth_state', 'spt_oauth_redirect']) {
    res.cookies.set(name, '', { path: '/', maxAge: 0 });
  }
  return res;
}

export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const errParam = url.searchParams.get('error');

  if (errParam) return back(req, { err: errParam });

  const expectedState = req.cookies.get('spt_oauth_state')?.value;
  const redirectUri = req.cookies.get('spt_oauth_redirect')?.value;

  if (!expectedState || !redirectUri) {
    return back(req, { err: 'oauth_cookie_missing' });
  }
  if (!code || !returnedState || returnedState !== expectedState) {
    return back(req, { err: 'state_mismatch' });
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return back(req, { err: 'env_missing' });

  try {
    const resp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return back(req, { err: `token_exchange_${resp.status}`, detail: body.slice(0, 200) });
    }
    const data = await resp.json();
    if (!data.refresh_token) return back(req, { err: 'no_refresh_token' });

    await setRefreshToken(data.refresh_token);
    invalidateToken();
    return back(req, { ok: '1' });
  } catch (e) {
    return back(req, { err: 'exchange_failed', detail: String(e?.message || e).slice(0, 200) });
  }
}
