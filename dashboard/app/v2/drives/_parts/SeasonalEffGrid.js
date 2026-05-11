'use client';

const SEASONS = [
  { key: '봄', months: '3–5월' },
  { key: '여름', months: '6–8월' },
  { key: '가을', months: '9–11월' },
  { key: '겨울', months: '12–2월' },
];

export default function SeasonalEffGrid({ seasonalEff }) {
  if (!seasonalEff || Object.keys(seasonalEff).length === 0) return null;

  const values = SEASONS.map(s => seasonalEff[s.key]).filter(v => v != null);
  const minWh = values.length ? Math.min(...values) : 0;
  const maxWh = values.length ? Math.max(...values) : 0;
  const getColor = (wh) => {
    if (wh == null) return 'text-zinc-700';
    if (wh <= minWh + (maxWh - minWh) * 0.25) return 'text-emerald-400';
    if (wh <= minWh + (maxWh - minWh) * 0.75) return 'text-amber-400';
    return 'text-red-400';
  };

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-3 py-2 border-b border-white/[0.06]">
        <span className="text-[11px] font-bold tracking-widest uppercase text-zinc-500">계절별 효율</span>
      </div>
      <div className="grid grid-cols-2">
        {SEASONS.map((s, i) => {
          const wh = seasonalEff[s.key];
          const borderR = i % 2 === 0 ? 'border-r border-white/[0.06]' : '';
          const borderB = i < 2 ? 'border-b border-white/[0.06]' : '';
          return (
            <div key={s.key} className={`text-center py-3 ${borderR} ${borderB}`}>
              <div className="text-[10px] text-zinc-600 mb-1">{s.key} <span className="text-zinc-700">{s.months}</span></div>
              {wh != null ? (
                <>
                  <div className={`text-sm font-extrabold tabular-nums ${getColor(wh)}`}>{wh}</div>
                  <div className="text-[9px] text-zinc-600 mt-0.5">Wh/km</div>
                </>
              ) : (
                <div className="text-sm font-bold text-zinc-700">—</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
