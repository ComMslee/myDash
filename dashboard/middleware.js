import { NextResponse } from 'next/server';

const PIN = process.env.DASHBOARD_PIN || '';
const COOKIE = 'myDash_auth';
const SALT = 'myDash-auth-v1';

let cachedToken = null;
async function expectedToken() {
  if (cachedToken) return cachedToken;
  if (!PIN) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(PIN),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(SALT));
  cachedToken = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return cachedToken;
}

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  // PIN 미설정 → 인증 비활성 (개발/마이그레이션 안전장치)
  if (!PIN) return NextResponse.next();

  const token = await expectedToken();
  const hasCookie = req.cookies.get(COOKIE)?.value === token;

  // 로그인/로그아웃 엔드포인트는 항상 통과
  if (pathname === '/api/login' || pathname === '/api/logout') {
    return NextResponse.next();
  }

  // 로그인 페이지: 이미 인증됐으면 next 또는 / 로 보내기
  if (pathname === '/login') {
    if (hasCookie) {
      const next = req.nextUrl.searchParams.get('next') || '/';
      return NextResponse.redirect(new URL(next, req.url));
    }
    return NextResponse.next();
  }

  if (hasCookie) return NextResponse.next();

  // API 는 401 JSON, 페이지는 /login 리다이렉트
  if (pathname.startsWith('/api/')) {
    return new NextResponse(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  const url = new URL('/login', req.url);
  if (pathname !== '/') url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|robots.txt|manifest.json).*)'],
};
