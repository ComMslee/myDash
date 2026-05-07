import { NextResponse } from 'next/server';
import { readAuth, writeAuth } from '@/lib/auth-store';
import { COOKIE, MAX_AGE, assertSameOrigin } from '@/lib/auth-helper';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const existing = await readAuth();
  if (existing) {
    return NextResponse.json({ error: 'ALREADY_SETUP' }, { status: 409 });
  }
  let body;
  try { body = await req.json(); } catch { body = {}; }
  const pin = String(body.pin ?? '');
  if (!/^\d{6}$/.test(pin)) {
    return NextResponse.json({ error: 'INVALID_PIN' }, { status: 400 });
  }
  const token = await writeAuth(pin);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
  return res;
}
