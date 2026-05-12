'use client';

import { Icon } from '@/app/lib/Icons';

const CFG = {
  ok:      { label: '정상',   dot: 'bg-emerald-400', halo: 'bg-emerald-500/15', pulse: true },
  slow:    { label: '느림',   dot: 'bg-amber-400',   halo: 'bg-amber-500/15',   pulse: false },
  fail:    { label: '오류',   dot: 'bg-rose-400',    halo: 'bg-rose-500/15',    pulse: false },
  running: { label: '실행 중', dot: 'bg-blue-400',    halo: 'bg-blue-500/15',    pulse: true },
  partial: { label: '부분',   dot: 'bg-zinc-400',    halo: 'bg-zinc-500/15',    pulse: false },
  idle:    { label: '대기',   dot: 'bg-zinc-600',    halo: 'bg-zinc-700/30',    pulse: false },
};

function pickState({ ok, slow, fail, running, idle }, total) {
  if (fail > 0) return 'fail';
  if (slow > 0) return 'slow';
  if (running > 0) return 'running';
  if (idle === total) return 'idle';
  if (idle > 0) return 'partial';
  return 'ok';
}

export function HeroCard({ counts, total, lastRun, autoErr, onRunAll }) {
  const cfg = CFG[pickState(counts, total)];
  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
            <span className={`absolute inset-0 rounded-full ${cfg.halo} ${cfg.pulse ? 'animate-pulse' : ''}`} />
            <span className={`relative w-4 h-4 rounded-full ${cfg.dot}`} />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-light tracking-tight">{cfg.label}</div>
            <div className="text-[11px] text-zinc-500 tabular-nums mt-0.5">
              <span className="text-zinc-300">{counts.ok}</span>
              <span className="text-zinc-600"> / {total} OK</span>
              {counts.slow > 0 && <span className="ml-2.5 text-amber-400 inline-flex items-center gap-1"><Icon name="warn" className="w-4 h-4" />{counts.slow}</span>}
              {counts.fail > 0 && <span className="ml-2.5 text-rose-400 inline-flex items-center gap-1"><Icon name="x" className="w-4 h-4" />{counts.fail}</span>}
              {counts.idle > 0 && counts.idle < total && <span className="ml-2.5 text-zinc-600">○ {counts.idle}</span>}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <button
            onClick={onRunAll}
            className="px-3 py-1.5 rounded-full bg-white/[0.05] hover:bg-white/[0.08] active:bg-white/[0.10] text-zinc-300 text-[11px] font-medium flex items-center gap-1.5"
          >
            <span className="text-[13px]">↻</span>
            <span>재실행</span>
          </button>
          <span className="text-[10px] text-zinc-600 tabular-nums">
            {lastRun ? new Date(lastRun).toLocaleTimeString('ko-KR', { hour12: false }) : '미실행'}
          </span>
        </div>
      </div>

      {/* 진행 바 — OK / slow / fail 비율 */}
      <div className="mt-4 h-1 rounded-full bg-white/[0.04] overflow-hidden flex">
        {counts.ok   > 0 && <div className="h-full bg-emerald-500/70" style={{ width: `${(counts.ok   / total) * 100}%` }} />}
        {counts.slow > 0 && <div className="h-full bg-amber-500/70"   style={{ width: `${(counts.slow / total) * 100}%` }} />}
        {counts.fail > 0 && <div className="h-full bg-rose-500/70"    style={{ width: `${(counts.fail / total) * 100}%` }} />}
      </div>

      {autoErr && (
        <div className="mt-3 text-[10px] text-zinc-600">
          driveId: <span className="text-rose-400">{autoErr}</span>
        </div>
      )}
    </div>
  );
}
