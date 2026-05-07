import { NextResponse } from 'next/server';
import { COOKIE } from '@/lib/auth-helper';

export const dynamic = 'force-dynamic';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
