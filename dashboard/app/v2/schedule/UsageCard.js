'use client';

// 이번 달 Tesla Fleet API 사용량 카드.
// 실제값(누적) + 예상값(말일까지 외삽) 진행바 + 카테고리별 호출 수.

export default function UsageCard({ usage }) {
  if (!usage) {
    return (
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-4">
        <div className="h-4 w-20 bg-white/[0.04] rounded animate-pulse" />
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
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-zinc-500 font-semibold tracking-wide">이번 달 사용량</p>
        <p className="text-[10px] text-zinc-600 tabular-nums">{usage.month}</p>
      </div>

      <div className="flex items-baseline gap-3 tabular-nums">
        <span className="text-2xl font-bold text-blue-400">${actual.toFixed(2)}</span>
        <span className="text-xs text-zinc-500">실제</span>
        <span className="text-zinc-700">·</span>
        <span className={`text-sm font-semibold ${overrun ? 'text-rose-400' : 'text-amber-400'}`}>
          ${projected.toFixed(2)}
        </span>
        <span className="text-xs text-zinc-500">예상</span>
        <span className="ml-auto text-xs text-zinc-500">/ ${credit}</span>
      </div>

      {/* 2-tone 진행바: 실제(진하게) + 예상(점선 영역) */}
      <div className="relative h-2 bg-zinc-900 rounded-full overflow-hidden">
        {/* 예상 (옅음) */}
        <div
          className={`absolute inset-y-0 left-0 ${overrun ? 'bg-rose-400/30' : 'bg-amber-400/30'}`}
          style={{ width: `${projectedPct}%` }}
        />
        {/* 실제 (진함) */}
        <div
          className="absolute inset-y-0 left-0 bg-blue-400"
          style={{ width: `${actualPct}%` }}
        />
      </div>

      <div className="grid grid-cols-4 gap-2 text-[10px] tabular-nums">
        <UsageCell label="Commands" value={usage.calls?.commands} />
        <UsageCell label="Wakes" value={usage.calls?.wakes} highlight />
        <UsageCell label="Data" value={usage.calls?.vehicle_data} />
        <UsageCell label="Signals" value={usage.calls?.streaming_signals} />
      </div>

      <p className="text-[10px] text-zinc-600">
        경과 {usage.elapsed_days}/{usage.total_days}일 · 결제수단 미등록 = 한도 초과 시 자동 차단 (청구 없음)
      </p>
    </div>
  );
}

function UsageCell({ label, value, highlight }) {
  return (
    <div className={`rounded-lg p-2 border ${highlight ? 'bg-amber-500/5 border-amber-500/20' : 'bg-zinc-900 border-white/[0.04]'}`}>
      <p className="text-zinc-500">{label}</p>
      <p className="text-zinc-200 font-semibold mt-0.5">{value ?? 0}</p>
    </div>
  );
}
