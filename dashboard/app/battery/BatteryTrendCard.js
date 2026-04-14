'use client';

function monthLabel(yyyymm) {
  const m = parseInt(yyyymm.split('-')[1], 10);
  return `${m}월`;
}

function barColor(current, base) {
  if (!base) return 'bg-zinc-600';
  const ratio = current / base;
  if (ratio >= 0.95) return 'bg-emerald-500';
  if (ratio >= 0.90) return 'bg-yellow-500';
  return 'bg-red-500';
}

export function CapacityTrendCard({ data }) {
  if (!data) return null;
  const recentCapacity = (data.capacity_trend || []).slice(-12);
  if (recentCapacity.length === 0) return null;

  const maxCapacity = Math.max(...recentCapacity.map(r => r.est_capacity_kwh));
  const firstCapacity = recentCapacity[0].est_capacity_kwh;
  const lastCapacity = recentCapacity[recentCapacity.length - 1].est_capacity_kwh;
  const pct = firstCapacity && lastCapacity ? ((lastCapacity / firstCapacity) * 100).toFixed(1) : null;

  return (
    <div className="rounded-2xl bg-[#161618] border border-white/[0.06] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-zinc-200">배터리 용량 추이</span>
        <span className="text-[10px] text-zinc-600">추정값 · 최근 12개월</span>
      </div>

      {pct && (
        <div className="mb-3 text-xs text-zinc-400">
          최초 추정: <span className="text-white font-medium">{firstCapacity} kWh</span>
          {' → '}최근: <span className="text-white font-medium">{lastCapacity} kWh</span>{' '}
          <span className={parseFloat(pct) >= 95 ? 'text-emerald-400' : parseFloat(pct) >= 90 ? 'text-yellow-400' : 'text-red-400'}>
            ({pct}%)
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {recentCapacity.map(row => {
          const barW = maxCapacity > 0 ? (row.est_capacity_kwh / maxCapacity) * 100 : 0;
          const isLowSample = row.sample_count < 2;
          return (
            <div key={row.month} className="flex items-center gap-2">
              <span className="text-[11px] text-zinc-500 w-7 shrink-0 text-right">{monthLabel(row.month)}</span>
              <div className="flex-1 h-4 bg-white/[0.04] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${isLowSample ? 'opacity-40' : ''} ${barColor(row.est_capacity_kwh, firstCapacity)}`}
                  style={{ width: `${barW}%` }}
                />
              </div>
              <span className={`text-[11px] w-14 shrink-0 text-right ${isLowSample ? 'text-zinc-600' : 'text-zinc-300'}`}>
                {row.est_capacity_kwh} kWh
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HabitTrendCard({ data }) {
  if (!data) return null;
  const recentHabit = (data.habit_trend || []).slice(-6);
  if (recentHabit.length === 0) return null;

  return (
    <div className="rounded-2xl bg-[#161618] border border-white/[0.06] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-zinc-200">월별 충전 레벨 추이</span>
        <span className="text-[10px] text-zinc-600">최근 6개월</span>
      </div>

      <div className="flex flex-col gap-3">
        {recentHabit.map(row => (
          <div key={row.month}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-zinc-500">{monthLabel(row.month)}</span>
              <span className="text-[10px] text-zinc-600">{row.charge_count}회</span>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] text-red-400 w-8 shrink-0">시작</span>
              <div className="flex-1 h-2.5 bg-white/[0.04] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-red-500/70" style={{ width: `${row.avg_start}%` }} />
              </div>
              <span className="text-[10px] text-zinc-400 w-8 shrink-0 text-right">{row.avg_start}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-emerald-400 w-8 shrink-0">종료</span>
              <div className="flex-1 h-2.5 bg-white/[0.04] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${row.avg_end}%` }} />
              </div>
              <span className="text-[10px] text-zinc-400 w-8 shrink-0 text-right">{row.avg_end}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
