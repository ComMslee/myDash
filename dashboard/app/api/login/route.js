import { NextResponse } from 'next/server';
import { readAuth, pinToken } from '@/lib/auth-store';
import { COOKIE, MAX_AGE, timingSafeEqual, assertSameOrigin } from '@/lib/auth-helper';
import { authCookieOpts } from '@/lib/cookie-opts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;
const LOCK_MS = 60_000;
const attempts = new Map();

function clientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

export async function POST(req) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const auth = await readAuth();
  if (!auth) {
    return NextResponse.json({ error: 'NEED_SETUP' }, { status: 412 });
  }

  const ip = clientIp(req);
  const now = Date.now();
  let entry = attempts.get(ip);

  if (entry && now < entry.lockUntil) {
    return NextResponse.json(
      { error: 'LOCKED', retryAfter: Math.ceil((entry.lockUntil - now) / 1000) },
      { status: 429 },
    );
  }

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const submitted = String(body.pin ?? '');
  const submittedToken = await pinToken(submitted);

  if (!timingSafeEqual(submittedToken, auth.token)) {
    if (!entry || now - entry.first > WINDOW_MS) {
      entry = { count: 0, first: now, lockUntil: 0 };
    }
    entry.count += 1;
    if (entry.count >= MAX_ATTEMPTS) entry.lockUntil = now + LOCK_MS;
    attempts.set(ip, entry);
    return NextResponse.json({ error: 'INVALID' }, { status: 401 });
  }

  attempts.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, auth.token, { ...authCookieOpts(req), maxAge: MAX_AGE });
  return res;
}
