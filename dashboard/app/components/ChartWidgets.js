'use client';

import { Icon } from '../lib/Icons';

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
          style={{ gridTemplateColumns: '24px repeat(6, 0.5fr) repeat(18, 1fr)', gap: '1px', marginBottom: '1px' }}
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
        style={{ gridTemplateColumns: '24px repeat(6, 0.5fr) repeat(18, 1fr)', gap: '1px' }}
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
