'use client';

import { effColor } from '@/lib/effColor';

export default function MonthlyHistoryByYear({ years, byYear, yearTotals, driveDaysByYear, curYear, maxDist }) {
  return (
    <div className="space-y-4">
      {years.map(year => {
        const t = yearTotals[year];
        const yr = parseInt(year);
        const isCurrentYear = yr === curYear;
        const totalDays = isCurrentYear
          ? Math.floor((Date.now() - new Date(`${yr}-01-01`).getTime()) / 86400000) + 1
          : (yr % 4 === 0 && (yr % 100 !== 0 || yr % 400 === 0)) ? 366 : 365;
        const driveDays = driveDaysByYear?.[yr] ?? 0;
        const noDriverDays = totalDays - driveDays;
        return (
          <div key={year} className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-baseline gap-3">
                <span className="text-base font-bold text-zinc-300">{year}</span>
                <div className="flex items-baseline gap-2.5 text-xs tabular-nums">
                  <span className="text-white font-bold">{t.total_distance_km}<span className="text-zinc-600 ml-0.5">km</span></span>
                  <span className="text-blue-400/70">{t.drive_count}<span className="text-zinc-600 ml-0.5">회</span></span>
                  <span className="text-green-400/70">{t.total_energy_kwh}<span className="text-zinc-600 ml-0.5">kWh</span></span>
                </div>
                <div className="flex-1" />
                {t.avg_wh_km != null && (
                  <span className="text-[11px] font-semibold tabular-nums" style={{ color: effColor(t.avg_wh_km) }}>
                    {t.avg_wh_km.toFixed(0)}<span className="text-zinc-700 ml-0.5">Wh/km</span>
                  </span>
                )}
                <span className="text-zinc-600 text-[11px]">월평균 <span className="text-zinc-400 font-medium">{t.avg_monthly_km}</span>km</span>
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-zinc-600">미운행</span>
                <span className="text-[11px] font-bold tabular-nums text-zinc-500">{noDriverDays}일</span>
              </div>
            </div>
            {byYear[year].map((m, i) => {
              const wh = m.avg_wh_km;
              const whColor = effColor(wh);
              const pct = maxDist > 0 ? Math.min(100, (m.total_distance_km / maxDist) * 100) : 0;
              return (
                <div
                  key={`${m.year}-${m.month}`}
                  className={`px-4 py-3 hover:bg-white/[0.03] transition-colors ${i < byYear[year].length - 1 ? 'border-b border-white/[0.06]' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-200 font-bold text-sm w-7 flex-shrink-0">{m.month}월</span>
                    <div className="flex-1 min-w-0">
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: '#3b82f6' }} />
                      </div>
                    </div>
                    <span className="text-white font-bold text-sm tabular-nums flex-shrink-0">{m.total_distance_km}<span className="text-zinc-600 text-xs ml-0.5">km</span></span>
                    <span className="text-zinc-600 text-xs tabular-nums flex-shrink-0"><span className="text-blue-400/70">{m.drive_count}</span>회</span>
                    <span className="text-zinc-600 text-xs tabular-nums flex-shrink-0"><span className="text-green-400/70">{m.total_energy_kwh}</span>kWh<span className="text-zinc-700 mx-0.5">·</span><span className="text-green-400/70">{m.charge_count}</span>회</span>
                    <span className="text-xs font-semibold tabular-nums w-12 text-right flex-shrink-0" style={{ color: whColor }}>
                      {wh != null ? `${wh.toFixed(0)}` : '—'}<span className="text-zinc-700 ml-0.5">Wh</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
