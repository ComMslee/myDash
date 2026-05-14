import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { saveTokens } from '@/lib/tesla-tokens';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/tesla/oauth/callback — Tesla 에서 code 들고 redirect 됨.
// state 쿠키 검증 (CSRF) → code 를 access/refresh token 으로 교환 → 암호화 저장.
// 인증 사용자 cookie 도 요구 — 외부 공격자가 callback URL 을 알아도 직접 호출 못 함.
export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const err = url.searchParams.get('error');

  if (err) {
    return new NextResponse(`Tesla auth denied: ${err}\n${url.searchParams.get('error_description') || ''}`, {
      status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  if (!code || !state) {
    return NextResponse.json({ error: 'missing code/state' }, { status: 400 });
  }

  const stateCookie = req.cookies.get('tesla_oauth_state')?.value || '';
  if (!stateCookie) return NextResponse.json({ error: 'state cookie missing' }, { status: 400 });
  // timing-safe compare
  const a = Buffer.from(state); const b = Buffer.from(stateCookie);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'state mismatch (CSRF)' }, { status: 400 });
  }

  const clientId = process.env.TESLA_FLEET_CLIENT_ID;
  const clientSecret = process.env.TESLA_FLEET_CLIENT_SECRET;
  const redirectUri = process.env.TESLA_FLEET_REDIRECT_URI;
  const oauthBase = process.env.TESLA_FLEET_OAUTH_BASE || 'https://auth.tesla.com/oauth2/v3';
  const audience = process.env.TESLA_FLEET_AUDIENCE || 'https://fleet-api.prd.na.vn.cloud.tesla.com';
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json({ error: 'env not configured' }, { status: 500 });
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    audience,
  });

  let tokenRes;
  try {
    tokenRes = await fetch(`${oauthBase}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    return NextResponse.json({ error: `token exchange network: ${e?.message}` }, { status: 502 });
  }
  if (!tokenRes.ok) {
    const txt = await tokenRes.text().catch(() => '');
    return NextResponse.json({ error: `token exchange HTTP ${tokenRes.status}`, detail: txt.slice(0, 500) }, { status: 502 });
  }
  const j = await tokenRes.json();
  if (!j.access_token || !j.refresh_token) {
    return NextResponse.json({ error: 'token response missing fields', got: Object.keys(j) }, { status: 502 });
  }

  await saveTokens({
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_in: j.expires_in,
    scope: j.scope,
  });

  // 성공 — state 쿠키 제거 + 설정 페이지로 리다이렉트
  const res = NextResponse.redirect(new URL('/v2/schedule?tesla=connected', req.url), 302);
  res.cookies.set('tesla_oauth_state', '', { path: '/api/tesla/oauth', maxAge: 0 });
  return res;
}
