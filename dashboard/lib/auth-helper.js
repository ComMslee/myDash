import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { readAuth } from './auth-store.js';

export const COOKIE = 'myDash_auth';
export const MAX_AGE = 60 * 60 * 24 * 90;

export async function requireAuth() {
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
