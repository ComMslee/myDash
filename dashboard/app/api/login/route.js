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

// 글로벌 카운터 — XFF 헤더 조작으로 per-IP 락을 우회하는 분산 brute-force 대응.
// 60초 30회 초과 시 503 (모든 IP 합산). 정상 사용자 영향 거의 없음 (PIN 입력은 분당 1~2회).
// NOTE: in-memory — 프로세스 재시작 시 카운터 리셋. 영속화는 후속 작업.
const GLOBAL_WINDOW_MS = 60_000;
const GLOBAL_MAX = 30;
let globalCounter = { count: 0, first: 0 };

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

  // 글로벌 lockout — per-IP 락보다 먼저 검사 (XFF 우회 차단)
  if (now - globalCounter.first > GLOBAL_WINDOW_MS) {
    globalCounter = { count: 0, first: now };
  }
  if (globalCounter.count >= GLOBAL_MAX) {
    return NextResponse.json(
      { error: 'GLOBAL_LOCKED', retryAfter: Math.ceil((GLOBAL_WINDOW_MS - (now - globalCounter.first)) / 1000) },
      { status: 503 },
    );
  }

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
    globalCounter.count += 1;
    return NextResponse.json({ error: 'INVALID' }, { status: 401 });
  }

  attempts.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, auth.token, { ...authCookieOpts(req), maxAge: MAX_AGE });
  return res;
}
