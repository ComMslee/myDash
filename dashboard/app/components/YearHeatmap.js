'use client';

import { useMemo } from 'react';

// 로그 스케일 5단계 intensity (0~1 opacity)
export function heatmapIntensity(val, max) {
  if (!val || val <= 0 || !max) return 0;
  const ratio = Math.min(1, val / max);
  if (ratio <= 0.05) return 0.2;
  if (ratio <= 0.2)  return 0.4;
  if (ratio <= 0.5)  return 0.6;
  if (ratio <= 0.8)  return 0.8;
  return 1.0;
}

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function buildWeeks({ latestLeft }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentSunday = new Date(today);
  currentSunday.setDate(today.getDate() - today.getDay());

  const weeksArr = [];
  // latestLeft=true: 왼쪽=최신(오늘주) → 오른쪽=52주 전
  // latestLeft=false: 왼쪽=52주 전 → 오른쪽=최신
  for (let i = 0; i <= 52; i++) {
    const w = latestLeft ? i : 52 - i;
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
}

/**
 * 연간 365일 히트맵 (GitHub 스타일)
 *
 * @param {Object} props
 * @param {Object} props.data - API 응답: { days: {'YYYY-MM-DD': { km, kwh, ... }}, max_km, max_kwh }
 * @param {boolean} props.loading
 * @param {string} props.title - 카드 제목
 * @param {('km'|'kwh')} props.metric - 표시할 값의 키
 * @param {string} props.color - 셀 색상 (hex)
 * @param {string} props.legendLabel - 범례 라벨 (예: '주행', '충전')
 * @param {boolean} [props.latestLeft=true] - 왼쪽이 최신이면 true
 * @param {(y:number, m:number)=>void} [props.onSelectMonth] - 월 클릭 핸들러
 */
export default function YearHeatmap({
  data,
  loading,
  title,
  metric,
  color,
  legendLabel,
  latestLeft = true,
  onSelectMonth,
}) {
  const weeks = useMemo(() => buildWeeks({ latestLeft }), [latestLeft]);

  const daysMap = data?.days || {};
  const max = metric === 'kwh' ? (data?.max_kwh || 0) : (data?.max_km || 0);

  // 각 주의 일요일이 월 첫 7일 이내면 월명 표시
  const monthLabels = weeks.map((week) => {
    const first = week[0].date;
    return first.getDate() <= 7 ? first.getMonth() + 1 : null;
  });

  const unitSuffix = metric === 'kwh' ? 'kWh' : 'km';

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-zinc-400">{title}</span>
        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          {latestLeft && <span className="text-zinc-600">최신 ←</span>}
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ background: color }} />{legendLabel}
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
                    const d = daysMap[key] || {};
                    const val = metric === 'kwh' ? (d.kwh || 0) : (d.km || 0);
                    const op = heatmapIntensity(val, max);
                    const title = `${date.getMonth()+1}/${date.getDate()} · ${val}${unitSuffix}`;
                    const cellStyle = op > 0 ? { background: color, opacity: op } : {};
                    if (onSelectMonth) {
                      return (
                        <button
                          key={di}
                          title={title}
                          onClick={() => onSelectMonth(date.getFullYear(), date.getMonth())}
                          className="w-[10px] h-[10px] rounded-[2px] bg-zinc-800/60 hover:ring-1 hover:ring-white/40 transition-shadow"
                          style={cellStyle}
                        />
                      );
                    }
                    return (
                      <div
                        key={di}
                        title={title}
                        className="w-[10px] h-[10px] rounded-[2px] bg-zinc-800/60"
                        style={cellStyle}
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
