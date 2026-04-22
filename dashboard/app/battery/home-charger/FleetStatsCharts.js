// FleetStatsPopup 내부에서 재사용되는 차트 프리미티브
import { DOW_LABELS } from './fleet-stats-utils';

// 누적치 대응 — 1.2k / 34k / 1.2M 축약. title/호버엔 원본값 유지.
function compact(n) {
  if (n == null) return '';
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  if (v < 1000) return String(v);
  if (v < 10000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  if (v < 1_000_000) return Math.round(v / 1000) + 'k';
  return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
}

// 수평 막대 — 최댓값 대비 비율로 채움 (최소 2%로 가시성 확보)
export function Bar({ value, max, className = '' }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className={`h-2 rounded-sm bg-zinc-800 overflow-hidden ${className}`}>
      <div className="h-full bg-blue-500/80" style={{ width: `${pct}%` }} />
    </div>
  );
}

// Top/Bottom 순위 행 — 2열 그리드 컴팩트 버전
// [좌측 강도 스트립][아이콘][라벨][카운트]
// 강도는 4px 두께 세로 바의 오파시티로 표현 (시간/요일 차트와 동일 색상 규칙)
export function RankRow({ icon, label, count, max, isPeak = false }) {
  const ratio = max > 0 ? count / max : 0;
  const color = isPeak ? '#f59e0b' : '#3b82f6';
  return (
    <div className="flex items-center gap-1.5 text-[10px] tabular-nums h-5">
      <div
        className="w-1 self-stretch rounded-full shrink-0"
        style={{ background: color, opacity: count === 0 ? 0.1 : 0.2 + ratio * 0.8 }}
        title={`${label}: ${count}회`}
      />
      <span className="text-zinc-500 w-4 text-center shrink-0">{icon}</span>
      <span className="text-zinc-200 flex-1 truncate">{label}</span>
      <span
        className={`shrink-0 tabular-nums ${isPeak ? 'text-amber-400 font-semibold' : 'text-zinc-400'}`}
        title={`${count}회`}
      >
        {compact(count)}
      </span>
    </div>
  );
}

// 24시간 오파시티 바 (주행 탭 패턴 스타일) + 시간별 카운트 표시
export function HourlyChart({ hourly }) {
  const max = Math.max(1, ...hourly);
  const peakHour = hourly.indexOf(max);
  const nonZero = hourly.filter(v => v > 0);
  const minNonZero = nonZero.length ? Math.min(...nonZero) : 0;
  const minHour = nonZero.length ? hourly.findIndex(v => v === minNonZero) : -1;
  const total = hourly.reduce((s, v) => s + v, 0);
  return (
    <div>
      <div className="flex gap-0.5 h-4">
        {hourly.map((v, h) => {
          const ratio = v / max;
          const isPeak = h === peakHour && v > 0;
          return (
            <div
              key={h}
              className="flex-1 rounded-[3px]"
              style={{
                background: isPeak ? '#f59e0b' : '#3b82f6',
                opacity: v === 0 ? 0.08 : 0.18 + ratio * 0.82,
              }}
              title={`${h}시: ${v}회`}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] text-zinc-500 tabular-nums px-px">
        <span className="font-semibold">0시</span><span>6</span><span>12</span><span>18</span><span>23시</span>
      </div>
      {max > 0 && (
        <div className="mt-1.5 text-[10px] text-zinc-400 flex flex-wrap gap-x-2 gap-y-0.5 tabular-nums">
          <span title={`${max}회`}>🔥 피크 {peakHour}시 ({compact(max)}회)</span>
          {minHour >= 0 && <span title={`${minNonZero}회`}>💤 한산 {minHour}시 ({compact(minNonZero)}회)</span>}
          <span title={`${total}회`}>총 {compact(total)}회</span>
        </div>
      )}
    </div>
  );
}

// 요일별 오파시티 바 (주행 탭 WeekdayBars 스타일) + 카운트 표시
export function DowChart({ dow }) {
  const max = Math.max(1, ...dow);
  const peakIdx = dow.indexOf(max);
  const nonZero = dow.filter(v => v > 0);
  const minVal = nonZero.length ? Math.min(...nonZero) : 0;
  return (
    <div className="flex gap-1">
      {dow.map((v, i) => {
        const ratio = v / max;
        const isPeak = i === peakIdx && v > 0;
        const isLow = v === minVal && v > 0 && v < max;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${DOW_LABELS[i]}: ${v}회`}>
            <div
              className="w-full h-4 rounded-[3px]"
              style={{
                background: isPeak ? '#f59e0b' : '#3b82f6',
                opacity: v === 0 ? 0.08 : 0.18 + ratio * 0.82,
              }}
            />
            <span className="text-[10px] text-zinc-500">{DOW_LABELS[i]}</span>
            <span className={`text-[10px] tabular-nums truncate max-w-full ${isPeak ? 'text-amber-400 font-semibold' : 'text-zinc-400'}`}>
              {compact(v)}{isPeak ? ' 🔥' : isLow ? ' 💤' : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
