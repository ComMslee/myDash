import { NextResponse } from 'next/server';
import { COOKIE, assertSameOrigin } from '@/lib/auth-helper';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
