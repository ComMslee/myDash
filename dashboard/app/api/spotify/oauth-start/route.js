import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { requireAuth } from '@/lib/auth-helper';

export const dynamic = 'force-dynamic';

const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-library-read',
  'user-library-modify',
  'user-read-recently-played',
].join(' ');

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// /v2/dev/spotify-relogin 의 "재인증" 버튼이 호출 — Spotify 로 redirect.
// Spotify 가 callback 으로 돌려보내면 oauth-callback/route.js 가 토큰 저장.
//
// HTTPS 필수: Spotify 가 redirect_uri 로 비-loopback HTTP 거부.
// prod 는 sslip.io + Caddy auto-cert 로 HTTPS 제공 → req.url.origin 이 https 면 동작.
export async function GET(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: 'SPOTIFY_CLIENT_ID 미설정' }, { status: 500 });

  const url = new URL(req.url);
  // X-Forwarded-Proto 가 https 면 https 로 (Caddy 가 TLS 종단)
  const proto = req.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || url.host;
  const redirectUri = `${proto}://${host}/api/spotify/oauth-callback`;

  if (!redirectUri.startsWith('https://') && !redirectUri.startsWith('http://127.0.0.1')) {
    return NextResponse.json({
      error: 'spotify 가 https 또는 loopback 만 허용',
      hint: `현재 redirect_uri=${redirectUri}. 'https://...sslip.io' 로 접속해서 재시도하세요.`,
    }, { status: 400 });
  }

  // Confidential client (client_secret 보유) — PKCE 제외, state 만 사용.
  // Spotify 가 양립 시 server_error 반환하는 경우 있어 단순화.
  const state = b64url(crypto.randomBytes(16));

  const authUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
    show_dialog: 'true',
  }).toString();

  const res = NextResponse.redirect(authUrl, 302);
  const cookieOpts = { httpOnly: true, secure: redirectUri.startsWith('https://'), sameSite: 'lax', path: '/', maxAge: 300 };
  res.cookies.set('spt_oauth_state', state, cookieOpts);
  res.cookies.set('spt_oauth_redirect', redirectUri, cookieOpts);
  return res;
}
