import { NextResponse } from 'next/server';
import { readAuth, writeAuth, pinToken } from '@/lib/auth-store';
import { COOKIE, MAX_AGE, requireAuth, timingSafeEqual } from '@/lib/auth-helper';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req) {
  const fail = await requireAuth();
  if (fail) return fail;

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const currentPin = String(body.currentPin ?? '');
  const newPin = String(body.newPin ?? '');

  if (!/^\d{6}$/.test(newPin)) {
    return NextResponse.json({ error: 'INVALID_NEW_PIN' }, { status: 400 });
  }

  const auth = await readAuth();
  if (!auth) return NextResponse.json({ error: 'NEED_SETUP' }, { status: 412 });

  const submitted = await pinToken(currentPin);
  if (!timingSafeEqual(submitted, auth.token)) {
    return NextResponse.json({ error: 'INVALID_CURRENT_PIN' }, { status: 401 });
  }

  const newToken = await writeAuth(newPin);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, newToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
  return res;
}
