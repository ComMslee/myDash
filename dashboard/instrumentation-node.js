// nodejs 런타임 전용 — webpack이 번들링하여 @/ alias 및 pg 등 외부 의존성을 정상 resolve.
// Next.js 기동 시 1회 + 2분 주기로 집충전기 캐시를 데운다.
import { warmIfNeeded, recordTick } from '@/lib/home-charger-cache';

const KEEP_WARM_INTERVAL_MS = 2 * 60_000;

const run = () => {
  recordTick(); // setInterval 생존 신호 (fresh no-op이어도 카운트)
  warmIfNeeded().catch(e => console.warn('[instrumentation] warm failed:', e.message));
};

run();
setInterval(run, KEEP_WARM_INTERVAL_MS);
console.log('[instrumentation] warm loop started (interval 2min)');
