// Next.js 기동 시 1회 실행 — 집충전기 캐시를 미리 데운다.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { warmIfNeeded } = await import('./lib/home-charger-cache.js');
    warmIfNeeded().catch(e => console.warn('[instrumentation] home-charger warm failed:', e.message));
  } catch (e) {
    console.warn('[instrumentation] register failed:', e.message);
  }
}
