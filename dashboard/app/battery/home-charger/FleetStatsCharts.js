// FleetStatsPopup 내부에서 재사용되는 차트 프리미티브
import { DOW_LABELS } from './fleet-stats-utils';

// 수평 막대 — 최댓값 대비 비율로 채움 (최소 2%로 가시성 확보)
export function Bar({ value, max, className = '' }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className={`h-2 rounded-sm bg-zinc-800 overflow-hidden ${className}`}>
      <div className="h-full bg-blue-500/80" style={{ width: `${pct}%` }} />
    </div>
  );
}

// Top/Bottom 순위 행 — [아이콘][라벨][막대][횟수]
export function RankRow({ icon, label, count, max }) {
  return (
    <div className="grid grid-cols-[2rem_4.5rem_1fr_3rem] items-center gap-2 text-[12px] tabular-nums">
      <span className="text-zinc-500 text-center">{icon}</span>
      <span className="text-zinc-200">{label}</span>
      <Bar value={count} max={max} />
      <span className="text-zinc-400 text-right">{count}</span>
    </div>
  );
}

// 24시간 히스토그램 + 피크/한산 태그
export function HourlyChart({ hourly }) {
  const max = Math.max(1, ...hourly);
  const peakHour = hourly.indexOf(max);
  const nonZero = hourly.filter(v => v > 0);
  const minNonZero = nonZero.length ? Math.min(...nonZero) : 0;
  const zeroHours = [];
  for (let h = 0; h < 24; h++) if (hourly[h] === 0) zeroHours.push(h);
  return (
    <div>
      <div className="flex items-end gap-[2px] h-24">
        {hourly.map((v, h) => {
          const hPct = max > 0 ? Math.max(2, Math.round((v / max) * 100)) : 0;
          const isPeak = h === peakHour && v > 0;
          return (
            <div
              key={h}
              className={`flex-1 rounded-t-sm ${v === 0 ? 'bg-zinc-800' : isPeak ? 'bg-amber-400' : 'bg-blue-500/70'}`}
              style={{ height: `${hPct}%` }}
              title={`${h}시 · ${v}회`}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] text-zinc-500 mt-1 tabular-nums">
        <span>0</span><span>6</span><span>12</span><span>18</span><span>23</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-400 mt-2">
        {max > 0 && <span>🔥 피크 {peakHour}시 ({max})</span>}
        {zeroHours.length > 0 && zeroHours.length <= 8 && (
          <span>💤 비사용 {zeroHours.map(h => `${h}시`).join(',')}</span>
        )}
        {nonZero.length > 0 && (
          <span>최소 {minNonZero}회</span>
        )}
      </div>
    </div>
  );
}

// 요일별 가로 막대 차트
export function DowChart({ dow }) {
  const max = Math.max(1, ...dow);
  const peakIdx = dow.indexOf(max);
  const nonZero = dow.filter(v => v > 0);
  const minVal = nonZero.length ? Math.min(...nonZero) : 0;
  return (
    <div className="space-y-1">
      {dow.map((v, i) => {
        const isPeak = i === peakIdx && v > 0;
        const isLow = v === minVal && v > 0 && v < max;
        return (
          <div key={i} className="grid grid-cols-[1.5rem_1fr_4rem] items-center gap-2 text-[12px] tabular-nums">
            <span className="text-zinc-400">{DOW_LABELS[i]}</span>
            <Bar value={v} max={max} />
            <span className="text-zinc-400 text-right">
              {v}{isPeak && ' 🔥'}{isLow && ' 💤'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
