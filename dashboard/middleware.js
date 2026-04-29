import { NextResponse } from 'next/server';

// 인증은 layout(페이지)·requireAuth(API) 에서 수행. middleware 는 layout 이
// 현재 경로를 알 수 있도록 x-pathname 헤더만 주입한다.
export function middleware(req) {
  const headers = new Headers(req.headers);
  headers.set('x-pathname', req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|robots.txt|manifest.json).*)'],
};
