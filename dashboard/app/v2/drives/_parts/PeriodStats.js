'use client';

function NewBadge() {
  return (
    <span className="text-[8px] font-bold px-1 py-px rounded bg-gradient-to-br from-blue-500 to-violet-500 text-white leading-none">NEW</span>
  );
}

export default function PeriodStats({ drives, monthlyHistory }) {
  const months = monthlyHistory?.months || [];
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  const thisMon = months.find(m => m.year === curY && m.month === curM);

  const stats = [
    { label: '오늘',     km: drives?.today_distance ?? 0,      kwh: drives?.today_energy_kwh ?? 0, highlight: false },
    { label: '이번주',   km: drives?.week_distance ?? 0,       kwh: drives?.week_energy_kwh ?? 0,  highlight: false },
    { label: '저번주',   km: drives?.prev_week_distance ?? 0,  kwh: drives?.prev_week_energy_kwh ?? 0, highlight: false },
    {
      label: '이번달',
      km: thisMon ? Number(thisMon.total_distance_km) : 0,
      kwh: thisMon ? Number(thisMon.total_energy_kwh) : 0,
      highlight: true,
    },
  ];

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      {stats.map((s, i) => {
        const eff = s.km > 0 && s.kwh > 0 ? (s.kwh / s.km * 1000).toFixed(0) : null;
        const isEmpty = s.km === 0 && s.kwh === 0;
        return (
          <div
            key={s.label}
            className={`grid grid-cols-4 px-4 py-3 items-center ${i < stats.length - 1 ? 'border-b border-white/[0.04]' : ''} ${s.highlight ? 'bg-blue-500/[0.04]' : ''}`}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-zinc-400">{s.label}</span>
              {s.highlight && <NewBadge />}
            </div>
            <div className="text-center">
              {isEmpty ? (
                <span className="text-base font-black tabular-nums text-zinc-700">—</span>
              ) : (
                <>
                  <span className="text-lg font-black tabular-nums leading-none text-blue-400">{s.km}</span>
                  <span className="text-[10px] text-zinc-600 ml-0.5">km</span>
                </>
              )}
            </div>
            <div className="text-center">
              {isEmpty ? (
                <span className="text-sm font-bold tabular-nums text-zinc-700">—</span>
              ) : (
                <>
                  <span className="text-sm font-bold tabular-nums leading-none text-green-400">{s.kwh}</span>
                  <span className="text-[10px] text-zinc-600 ml-0.5">kWh</span>
                </>
              )}
            </div>
            <div className="text-center">
              {!eff ? (
                <span className="text-sm font-bold tabular-nums text-zinc-700">—</span>
              ) : (
                <>
                  <span className="text-sm font-bold tabular-nums leading-none text-amber-400">{eff}</span>
                  <span className="text-[10px] text-zinc-600 ml-0.5">Wh/km</span>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
