'use client';

export function CombinedHourlyHeatmap({ driveData, chargeData }) {
  const driveMax = Math.max(1, ...driveData.map(h => h.count));
  const chargeMax = Math.max(1, ...chargeData.map(h => h.count));
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-[10px] text-blue-400/70 w-5 shrink-0 text-right">주행</span>
        <div className="flex gap-0.5 h-3.5 flex-1">
          {driveData.map(h => {
            const ratio = h.count / driveMax;
            return (
              <div key={h.hour} className="flex-1 rounded-[2px]"
                style={{ background: '#3b82f6', opacity: h.count === 0 ? 0.08 : 0.15 + ratio * 0.85 }}
                title={`${h.hour}시 주행: ${h.count}회`} />
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-green-400/70 w-5 shrink-0 text-right">충전</span>
        <div className="flex gap-0.5 h-3.5 flex-1">
          {chargeData.map(h => {
            const ratio = h.count / chargeMax;
            return (
              <div key={h.hour} className="flex-1 rounded-[2px]"
                style={{ background: '#22c55e', opacity: h.count === 0 ? 0.08 : 0.15 + ratio * 0.85 }}
                title={`${h.hour}시 충전: ${h.count}회`} />
            );
          })}
        </div>
      </div>
      <div className="flex justify-between mt-1 text-xs text-zinc-500 pl-[26px]" aria-hidden="true">
        <span>0시</span><span>6</span><span>12</span><span>18</span><span>23시</span>
      </div>
    </div>
  );
}

export function CombinedWeekdayBars({ driveData, chargeData }) {
  const driveMax = Math.max(1, ...driveData.map(d => d.count));
  const chargeMax = Math.max(1, ...chargeData.map(d => d.count));
  const labels = ['일', '월', '화', '수', '목', '금', '토'];
  return (
    <div className="flex gap-0.5">
      {driveData.map((d, i) => {
        const c = chargeData[i];
        const driveRatio = d.count / driveMax;
        const chargeRatio = c ? c.count / chargeMax : 0;
        return (
          <div key={d.dow} className="flex-1 flex flex-col items-center gap-0.5">
            <div className="w-full h-3.5 rounded-[2px]"
              style={{ background: '#3b82f6', opacity: d.count === 0 ? 0.08 : 0.15 + driveRatio * 0.85 }}
              title={`${labels[d.dow]} 주행: ${d.count}회`} />
            <div className="w-full h-3.5 rounded-[2px]"
              style={{ background: '#22c55e', opacity: (c?.count || 0) === 0 ? 0.08 : 0.15 + chargeRatio * 0.85 }}
              title={`${labels[d.dow]} 충전: ${c?.count || 0}회`} />
            <span className="text-[10px] text-zinc-500">{labels[d.dow]}</span>
          </div>
        );
      })}
    </div>
  );
}

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
