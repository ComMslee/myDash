'use client';

import { Icon } from '../lib/Icons';

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

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// 7×24 시간×요일 progress-bar 히트맵 — data: 7×24 number[][] (dow x hour)
// 셀별 막대 높이로 카운트 강도 표현 — 피크(>0.75)는 amber 강조
export function HourDowHeatmap({ data, hexColor = '#3b82f6' }) {
  if (!data || data.length !== 7) return null;
  const flat = data.flat();
  const max = Math.max(1, ...flat);
  const total = flat.reduce((s, v) => s + v, 0);

  let peakDow = 0, peakHour = 0, peakVal = 0;
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) {
    if (data[d][h] > peakVal) { peakVal = data[d][h]; peakDow = d; peakHour = h; }
  }

  return (
    <div>
      {DOW_LABELS.map((lab, d) => (
        <div
          key={d}
          className="grid items-center"
          style={{ gridTemplateColumns: '18px repeat(6, 0.5fr) repeat(18, 1fr)', gap: '1px', marginBottom: '1px' }}
        >
          <div className="text-[9px] text-zinc-500 text-center">{lab}</div>
          {data[d].map((v, h) => {
            const ratio = v / max;
            const isPeak = ratio > 0.75;
            // ratio < 12% 라도 값이 있으면 막대가 시각적으로 보이도록 floor
            const fillPct = v > 0 ? Math.max(12, ratio * 100) : 0;
            return (
              <div
                key={h}
                className="h-5 relative bg-zinc-800/30 rounded-[1px] overflow-hidden"
                title={`${lab} ${h}시: ${v}회`}
              >
                {v > 0 && (
                  <div
                    className="absolute left-0 right-0 bottom-0"
                    style={{ background: isPeak ? '#f59e0b' : hexColor, height: `${fillPct}%` }}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
      <div
        className="grid text-[9px] text-zinc-500 tabular-nums mt-1 whitespace-nowrap"
        style={{ gridTemplateColumns: '18px repeat(6, 0.5fr) repeat(18, 1fr)', gap: '1px' }}
      >
        <div />
        <div className="font-semibold" style={{ gridColumn: 2 }}>0시</div>
        <div style={{ gridColumn: 8 }}>6</div>
        <div style={{ gridColumn: 14 }}>12</div>
        <div style={{ gridColumn: 20 }}>18</div>
        <div className="text-right" style={{ gridColumn: 25 }}>23시</div>
      </div>
      {peakVal > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 mt-1.5 text-[10px] text-zinc-500 tabular-nums">
          <span className="inline-flex items-center gap-1 text-orange-400/80"><Icon name="fire" />피크 {DOW_LABELS[peakDow]} {peakHour}시 ({peakVal}회)</span>
          <span className="ml-auto">총 {total}회</span>
        </div>
      )}
    </div>
  );
}
