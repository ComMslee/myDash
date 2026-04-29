import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PIN = process.env.DASHBOARD_PIN || '';
const COOKIE = 'myDash_auth';
const SALT = 'myDash-auth-v1';
const MAX_AGE = 60 * 60 * 24 * 365;

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;
const LOCK_MS = 60_000;
const attempts = new Map();

async function buildToken(pin) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(SALT));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function clientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(req) {
  if (!PIN) {
    return NextResponse.json({ error: 'PIN_NOT_CONFIGURED' }, { status: 500 });
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
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const submitted = String(body.pin ?? '');

  if (!timingSafeEqual(submitted, PIN)) {
    if (!entry || now - entry.first > WINDOW_MS) {
      entry = { count: 0, first: now, lockUntil: 0 };
    }
    entry.count += 1;
    if (entry.count >= MAX_ATTEMPTS) entry.lockUntil = now + LOCK_MS;
    attempts.set(ip, entry);
    return NextResponse.json({ error: 'INVALID' }, { status: 401 });
  }

  attempts.delete(ip);
  const token = await buildToken(PIN);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
  return res;
}
