import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { readAuth } from './auth-store.js';

export const COOKIE = 'myDash_auth';
export const MAX_AGE = 60 * 60 * 24 * 90;

// 내부 서비스(텔레그램 hub 등) 호출 시 X-Hub-Secret 헤더로 쿠키 인증 우회.
// dashboard ↔ hub 가 양방향으로 같은 비밀을 공유 (docker-compose.yml HUB_SHARED_SECRET).
export async function requireAuth() {
  const HUB_SECRET = process.env.HUB_SHARED_SECRET || '';
  if (HUB_SECRET) {
    const hdr = headers().get('x-hub-secret');
    if (hdr && timingSafeEqual(hdr, HUB_SECRET)) return null;
  }
  const auth = await readAuth();
  if (!auth) {
    return NextResponse.json({ error: 'NEED_SETUP' }, { status: 412 });
  }
  const c = cookies().get(COOKIE)?.value;
  if (!c || c !== auth.token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

export function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
