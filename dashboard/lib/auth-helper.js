import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { timingSafeEqual as cryptoTimingSafeEqual } from 'node:crypto';
import { readAuth } from './auth-store.js';

export const COOKIE = 'myDash_auth';
export const MAX_AGE = 60 * 60 * 24 * 90;

// 내부 서비스(텔레그램 hub 등) 호출 시 X-Hub-Secret 헤더로 쿠키 인증 우회.
// dashboard ↔ hub 가 양방향으로 같은 비밀을 공유 (docker-compose.yml HUB_SHARED_SECRET).
function isHubCall() {
  const HUB_SECRET = process.env.HUB_SHARED_SECRET || '';
  if (!HUB_SECRET) return false;
  const hdr = headers().get('x-hub-secret');
  return !!(hdr && timingSafeEqual(hdr, HUB_SECRET));
}

export async function requireAuth() {
  if (isHubCall()) return null;
  const auth = await readAuth();
  if (!auth) {
    return NextResponse.json({ error: 'NEED_SETUP' }, { status: 412 });
  }
  const c = cookies().get(COOKIE)?.value;
  if (!c || !timingSafeEqual(c, auth.token)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

// CSRF — 상태 변경 POST 라우트에서 쿠키 인증 호출의 Origin 을 host 와 비교.
// hub 호출(X-Hub-Secret 매치)은 통과 — 봇은 same-site fetch 가 아니므로 Origin 헤더 부재가 정상.
// 일반 브라우저 fetch/form submit 은 POST 시 항상 Origin 을 자동 첨부 — 미설정 시 차단.
export function assertSameOrigin(req) {
  if (isHubCall()) return null;
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin) {
    return NextResponse.json({ error: 'csrf_origin_required' }, { status: 403 });
  }
  let originHost;
  try { originHost = new URL(origin).host; } catch {
    return NextResponse.json({ error: 'csrf_origin_malformed' }, { status: 403 });
  }
  if (originHost !== host) {
    return NextResponse.json({ error: 'csrf_origin_mismatch' }, { status: 403 });
  }
  return null;
}

// node:crypto 의 상수-시간 비교 위임 — 입력은 string (PIN/토큰).
// 길이 다르면 즉시 false (timingSafeEqual 자체는 같은 길이 요구).
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return cryptoTimingSafeEqual(ab, bb);
}
