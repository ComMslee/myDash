// nodejs 런타임 전용 — webpack이 번들링하여 @/ alias 및 pg 등 외부 의존성을 정상 resolve.
// Next.js 기동 시 1회 + 2분 주기로 집충전기 캐시를 데운다.
// Tesla 자동화 워커도 같이 부팅 (1분 주기 — 시간/장소/날씨 조건 평가).
import { warmIfNeeded, recordTick } from '@/lib/home-charger-cache';
import { tick as schedulerTick } from '@/lib/worker-tick';

const KEEP_WARM_INTERVAL_MS = 2 * 60_000;
const SCHEDULER_TICK_MS = 60_000;

const run = () => {
  recordTick(); // setInterval 생존 신호 (fresh no-op이어도 카운트)
  warmIfNeeded().catch(e => console.warn('[instrumentation] warm failed:', e.message));
};

// 핫리로드/번들 중복 import 시 setInterval 이 N개 생성되어 외부 API 호출이 N배가 되는 것 차단.
// (tesla-scheduler 와 동일 globalThis 가드 패턴)
if (!globalThis.__homeChargerWarmStarted) {
  globalThis.__homeChargerWarmStarted = true;
  run();
  setInterval(run, KEEP_WARM_INTERVAL_MS);
  console.log('[instrumentation] warm loop started (interval 2min)');
}

// Tesla 자동화 워커 — 부팅 5초 후 첫 평가, 그 뒤 60초마다.
if (!globalThis.__teslaSchedulerStarted) {
  globalThis.__teslaSchedulerStarted = true;
  setTimeout(() => { schedulerTick().catch(e => console.warn('[tesla-scheduler] tick failed:', e?.message)); }, 5_000);
  setInterval(() => { schedulerTick().catch(e => console.warn('[tesla-scheduler] tick failed:', e?.message)); }, SCHEDULER_TICK_MS);
  console.log('[tesla-scheduler] worker started — tick every 60s');
}
