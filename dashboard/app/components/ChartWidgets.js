'use client';

export function HourlyHeatmap({ data, hexColor, valueKey = 'count' }) {
  const max = Math.max(1, ...data.map(h => h[valueKey]));
  return (
    <div>
      <div className="flex gap-0.5 h-4">
        {data.map(h => {
          const ratio = h[valueKey] / max;
          return (
            <div
              key={h.hour}
              className="flex-1 rounded-[3px]"
              style={{ background: hexColor, opacity: 0.18 + ratio * 0.82 }}
              title={`${h.hour}시: ${h[valueKey]}회`}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-1 text-xs text-zinc-500 px-px" aria-hidden="true">
        <span className="font-semibold">0시</span><span>6</span><span>12</span><span>18</span><span>23시</span>
      </div>
    </div>
  );
}

export function WeekdayBars({ data, hexColor, valueKey = 'count' }) {
  const max = Math.max(1, ...data.map(d => d[valueKey]));
  const labels = ['일', '월', '화', '수', '목', '금', '토'];
  return (
    <div className="flex gap-0.5">
      {data.map(d => {
        const ratio = d[valueKey] / max;
        return (
          <div key={d.dow} className="flex-1 flex flex-col items-center gap-1" title={`${labels[d.dow]}: ${d[valueKey]}회`}>
            <div
              className="w-full h-4 rounded-[3px]"
              style={{ background: hexColor, opacity: d[valueKey] === 0 ? 0.08 : 0.18 + ratio * 0.82 }}
            />
            <span className="text-[10px] text-zinc-500">{labels[d.dow]}</span>
          </div>
        );
      })}
    </div>
  );
}
