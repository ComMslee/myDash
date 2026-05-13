'use client';

// 이번 달 Tesla Fleet API 사용량 — 간략 카드 (실제 + 예상 + 진행바)

export default function UsageCard({ usage }) {
  if (!usage) {
    return (
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-3">
        <div className="h-3 w-24 bg-white/[0.04] rounded animate-pulse" />
      </div>
    );
  }
  const actual = Number(usage.actual_cost) || 0;
  const projected = Number(usage.projected_cost) || 0;
  const credit = Number(usage.credit) || 10;
  const actualPct = Math.min(100, (actual / credit) * 100);
  const projectedPct = Math.min(100, (projected / credit) * 100);
  const overrun = projectedPct >= 100;

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-3 py-2 space-y-1.5">
      <div className="flex items-baseline gap-2 tabular-nums">
        <span className="text-base font-bold text-blue-400">${actual.toFixed(2)}</span>
        <span className={`text-xs ${overrun ? 'text-rose-400' : 'text-amber-400'}`}>예상 ${projected.toFixed(2)}</span>
        <span className="ml-auto text-[10px] text-zinc-500">/ ${credit} · {usage.elapsed_days}/{usage.total_days}일</span>
      </div>
      <div className="relative h-1.5 bg-zinc-900 rounded-full overflow-hidden">
        <div className={`absolute inset-y-0 left-0 ${overrun ? 'bg-rose-400/30' : 'bg-amber-400/30'}`} style={{ width: `${projectedPct}%` }} />
        <div className="absolute inset-y-0 left-0 bg-blue-400" style={{ width: `${actualPct}%` }} />
      </div>
    </div>
  );
}
