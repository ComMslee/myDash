'use client';

// ms 단위 — lib/format.js::formatDuration(minutes)과 다름
function formatDuration(ms) {
  if (!ms || ms < 0) return '-';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, '0')}`;
}

// 서버 인스트루멘테이션 진단 카드 — 백그라운드 폴링 루프 생존 여부 체크
// 주의: lastWarmAt은 실제 upstream fetch 시점이라 캐시가 fresh하면 오래돼 보이는 게 정상.
//       루프 생존은 tickCallCount(setInterval 콜백 카운터)로 판정.
const TICK_INTERVAL_MS = 2 * 60_000;

export function WarmDiagCard({ diag }) {
  if (!diag) return null;
  const now = Date.now();
  const sinceLastWarm = diag.lastWarmAt ? now - diag.lastWarmAt : null;
  const sinceLastTick = diag.lastTickAt ? now - diag.lastTickAt : null;
  const sinceBoot = diag.processStartedAt ? now - diag.processStartedAt : null;
  const expectedTicks = sinceBoot != null ? Math.floor(sinceBoot / TICK_INTERVAL_MS) + 1 : 0;
  const actualTicks = diag.tickCallCount || 0;
  const tickStale =
    (sinceLastTick != null && sinceLastTick > TICK_INTERVAL_MS + 30_000) ||
    (expectedTicks - actualTicks >= 2);
  return (
    <div className="bg-[#1a1a1c] border border-white/[0.06] rounded-lg px-3 py-1.5 text-[11px] tabular-nums">
      <div className="grid grid-cols-3 gap-1 text-center">
        <div>
          <div className="text-[9px] text-zinc-500">기동 후</div>
          <div className="text-zinc-300 font-semibold">{sinceBoot != null ? formatDuration(sinceBoot) : '-'}</div>
        </div>
        <div>
          <div className="text-[9px] text-zinc-500">마지막 tick</div>
          <div className={tickStale ? 'text-rose-400 font-semibold' : 'text-emerald-400 font-semibold'}>
            {sinceLastTick != null ? `${formatDuration(sinceLastTick)} 전` : '-'}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-zinc-500">warm 수</div>
          <div className="text-zinc-300 font-semibold">
            {diag.warmCallCount || 0}
            {sinceLastWarm != null && (
              <span className="text-[9px] text-zinc-500 ml-0.5">({formatDuration(sinceLastWarm)})</span>
            )}
          </div>
        </div>
      </div>
      {tickStale && (
        <div className="mt-1 text-[10px] text-rose-400">⚠️ 2분 tick 정체</div>
      )}
    </div>
  );
}
