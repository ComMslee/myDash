// Next.js 기동 시 1회 + 주기적 실행 — 집충전기 캐시를 항상 데워둔다.
const KEEP_WARM_INTERVAL_MS = 2 * 60_000; // 2분마다 점검 (warmIfNeeded는 fresh면 no-op, statId 필터로 호출당 1call)

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    // 빌드 후 이 파일은 .next/server/instrumentation.js 로 이동하므로 ../../ 로 올라가야 /app/lib/... 에 도달.
    const { warmIfNeeded } = await import(/* webpackIgnore: true */ '../../lib/home-charger-cache.js');
    const run = () => warmIfNeeded().catch(e => console.warn('[instrumentation] warm failed:', e.message));
    run();
    setInterval(run, KEEP_WARM_INTERVAL_MS);
  } catch (e) {
    console.warn('[instrumentation] register failed:', e.message);
  }
}
