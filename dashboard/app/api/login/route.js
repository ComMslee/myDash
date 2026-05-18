import { NextResponse } from 'next/server';
import { readAuth, pinToken } from '@/lib/auth-store';
import { COOKIE, MAX_AGE, timingSafeEqual, assertSameOrigin } from '@/lib/auth-helper';
import { authCookieOpts } from '@/lib/cookie-opts';
import { TG_HUB_URL } from '@/lib/internal-urls';
import { KST_OFFSET_MS } from '@/lib/kst';

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

// 연속 실패 알림 — 단일 IP 가 누적 10회 실패 시 텔레그램 알람 1회 발송.
// per-IP 60초 락(5회)과 별개로 누적 카운트. 락 후 풀리고 다시 시도해도 누적은 유지.
// 성공 1회로 해당 IP 카운터 삭제. 알림 후에도 0 리셋해 다음 10회마다 재발송.
// value = { streak, lastSeen } — lastSeen 으로 24h 미접속 IP 는 sweep 에서 제거 (메모리 누수 방지).
const ALERT_THRESHOLD = 10;
const STREAK_RETENTION_MS = 24 * 60 * 60 * 1000;
const failStreakByIp = new Map();

// 만료된 항목 정리 — 분산 brute-force 후 도달 가능 IP 의 무한 누적 차단.
// attempts: lock 만료 AND window 만료된 항목. failStreakByIp: 24h 미접속.
function sweepStaleEntries(now) {
  for (const [ip, entry] of attempts) {
    if (now >= entry.lockUntil && now - entry.first > WINDOW_MS) {
      attempts.delete(ip);
    }
  }
  for (const [ip, entry] of failStreakByIp) {
    if (now - entry.lastSeen > STREAK_RETENTION_MS) {
      failStreakByIp.delete(ip);
    }
  }
}

async function notifyAdminFailure({ ip, count }) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return;
  const secret = process.env.HUB_SHARED_SECRET || '';
  const kst = new Date(Date.now() + KST_OFFSET_MS).toISOString().replace('T', ' ').slice(0, 19) + ' KST';
  const text = `🚨 myDash PIN 연속 ${count}회 실패\n시각: ${kst}\n최근 IP: ${ip}`;
  try {
    const headers = { 'content-type': 'application/json' };
    if (secret) headers.authorization = `Bearer ${secret}`;
    await fetch(`${TG_HUB_URL}/notify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (e) {
    console.error('[login] alert notify failed', e?.message);
  }
}

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
  sweepStaleEntries(now);

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
    const streak = (failStreakByIp.get(ip)?.streak ?? 0) + 1;
    if (streak >= ALERT_THRESHOLD) {
      failStreakByIp.delete(ip);
      notifyAdminFailure({ ip, count: streak }).catch(() => {});
    } else {
      failStreakByIp.set(ip, { streak, lastSeen: now });
    }
    return NextResponse.json({ error: 'INVALID' }, { status: 401 });
  }

  attempts.delete(ip);
  failStreakByIp.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, auth.token, { ...authCookieOpts(req), maxAge: MAX_AGE });
  return res;
}
