import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { readAuth } from '@/lib/auth-store';
import { COOKIE } from '@/lib/auth-helper';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Caddy forward_auth subrequest endpoint.
// 200 → 통과, 302 → 미인증 → /login 으로 보냄.
export async function GET(req) {
  const auth = await readAuth();
  const token = cookies().get(COOKIE)?.value;
  if (auth && token && token === auth.token) {
    return new Response(null, { status: 200 });
  }

  const proto = req.headers.get('x-forwarded-proto') || 'http';
  const fwdHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  const fwdUri = req.headers.get('x-forwarded-uri') || '/';
  const hostNoPort = fwdHost.split(':')[0];

  const original = fwdHost ? `${proto}://${fwdHost}${fwdUri}` : fwdUri;
  const loginBase = hostNoPort ? `${proto}://${hostNoPort}/login` : '/login';
  const loginUrl = `${loginBase}?next=${encodeURIComponent(original)}`;

  return NextResponse.redirect(loginUrl, 302);
}
