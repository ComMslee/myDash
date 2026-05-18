import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { requireAuth } from '@/lib/auth-helper';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/tesla/oauth/start — 대시보드 인증 사용자만 호출 가능.
// state CSRF 토큰 발급 → state 쿠키(httpOnly, short-lived) 셋업 → Tesla 인증 URL 로 302.
export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const clientId = process.env.TESLA_FLEET_CLIENT_ID;
  const redirectUri = process.env.TESLA_FLEET_REDIRECT_URI;
  const oauthBase = process.env.TESLA_FLEET_OAUTH_BASE || 'https://auth.tesla.com/oauth2/v3';
  const audience = process.env.TESLA_FLEET_AUDIENCE || 'https://fleet-api.prd.na.vn.cloud.tesla.com';

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'TESLA_FLEET_CLIENT_ID / REDIRECT_URI not configured' },
      { status: 500 },
    );
  }

  const state = randomBytes(24).toString('hex');
  const scopes = [
    'openid',
    'offline_access',
    'user_data',
    'vehicle_device_data',
    'vehicle_location',
    'vehicle_cmds',
    'vehicle_charging_cmds',
  ].join(' ');

  const url = new URL(`${oauthBase}/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('state', state);
  url.searchParams.set('audience', audience);
  url.searchParams.set('prompt', 'login');

  const res = NextResponse.redirect(url.toString(), 302);
  res.cookies.set('tesla_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: redirectUri.startsWith('https://'),
    path: '/api/tesla/oauth',
    maxAge: 600, // 10분
  });
  return res;
}
