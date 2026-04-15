'use client';

import { useEffect, useMemo, useState } from 'react';

function intensity(val, max) {
  if (!val || val <= 0 || !max) return 0;
  const ratio = Math.min(1, val / max);
  if (ratio <= 0.05) return 0.2;
  if (ratio <= 0.2)  return 0.4;
  if (ratio <= 0.5)  return 0.6;
  if (ratio <= 0.8)  return 0.8;
  return 1.0;
}

export default function ChargeHeatmap() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/year-heatmap')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // 최신이 왼쪽
  const weeks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentSunday = new Date(today);
    currentSunday.setDate(today.getDate() - today.getDay());

    const weeksArr = [];
    for (let w = 0; w <= 52; w++) {
      const weekStart = new Date(currentSunday);
      weekStart.setDate(weekStart.getDate() - w * 7);
      const days = [];
      for (let d = 0; d < 7; d++) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + d);
        const future = day > today;
        days.push({ date: day, future });
      }
      weeksArr.push(days);
    }
    return weeksArr;
  }, []);

  const daysMap = data?.days || {};
  const maxKwh = data?.max_kwh || 0;

  const fmtDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  const monthLabels = weeks.map((week) => {
    const first = week[0].date;
    return first.getDate() <= 7 ? first.getMonth() + 1 : null;
  });

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-zinc-400">지난 1년 충전</span>
        <div className="flex items-center gap-1 text-[10px] text-zinc-500">
          <span className="text-zinc-600">최신 ←</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-green-500" />충전
          </span>
        </div>
      </div>
      {loading ? (
        <div className="h-24 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto no-scrollbar">
          <div className="flex flex-col gap-[3px] min-w-fit">
            <div className="flex gap-[3px] pl-[18px] text-[9px] text-zinc-600 tabular-nums h-3">
              {monthLabels.map((m, i) => (
                <div key={i} className="w-[10px] text-left leading-none">
                  {m != null ? `${m}` : ''}
                </div>
              ))}
            </div>
            <div className="flex gap-[3px]">
              <div className="flex flex-col gap-[3px] text-[9px] text-zinc-600 pr-[3px] w-[15px]">
                {['', '월', '', '수', '', '금', ''].map((d, i) => (
                  <div key={i} className="h-[10px] leading-none">{d}</div>
                ))}
              </div>
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map(({ date, future }, di) => {
                    if (future) {
                      return <div key={di} className="w-[10px] h-[10px]" />;
                    }
                    const key = fmtDate(date);
                    const d = daysMap[key] || { kwh: 0 };
                    const op = intensity(d.kwh, maxKwh);
                    const title = `${date.getMonth()+1}/${date.getDate()} · ${d.kwh||0}kWh`;
                    return (
                      <div
                        key={di}
                        title={title}
                        className="w-[10px] h-[10px] rounded-[2px] bg-zinc-800/60"
                        style={op > 0 ? { background: '#22c55e', opacity: op } : {}}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
