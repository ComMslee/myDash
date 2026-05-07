// CycleCard.js - default export
export default function CycleCard({ data }) {
  const {
    total_kwh = 0,
    battery_capacity_kwh = 0,
    total_cycles = 0,
    this_week_kwh = 0,
    this_week_cycles = 0,
    this_month_kwh = 0,
    this_month_cycles = 0,
    avg_monthly_cycles = 0,
    odometer_km = 0,
    is_estimated = false,
  } = data || {};

  const MAX_CYCLES = 1500;
  const progress = Math.min(total_cycles / MAX_CYCLES, 1);
  const healthPct = Math.max(0, 100 - (total_cycles / MAX_CYCLES) * 100);

  const SIZE = 140;
  const CX = SIZE / 2;
  const CY = SIZE / 2 + 8;
  const R = 54;
  const STROKE = 9;
  const GAP_DEG = 140;
  const START_DEG = 90 + GAP_DEG / 2;
  const ARC_TOTAL = 220;

  function polarToXY(deg, r) {
    const rad = (deg * Math.PI) / 180;
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
  }

  function describeArc(startDeg, endDeg, r) {
    const start = polarToXY(startDeg, r);
    const end = polarToXY(endDeg, r);
    const totalAngle = ((endDeg - startDeg + 360) % 360);
    const largeArc = totalAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  }

  const progressEndDeg = START_DEG + ARC_TOTAL * progress;
  const trackPath = describeArc(START_DEG, START_DEG + ARC_TOTAL, R);
  const progressPath = progress > 0
    ? describeArc(START_DEG, Math.min(progressEndDeg, START_DEG + ARC_TOTAL), R)
    : null;

  let arcColor;
  if (progress < 0.3) arcColor = '#10b981';
  else if (progress < 0.7) arcColor = '#3b82f6';
  else if (progress < 0.9) arcColor = '#f59e0b';
  else arcColor = '#ef4444';

  const isEmpty = total_kwh === 0;

  function formatCycles(val) {
    if (!val) return '—';
    return val.toFixed(2);
  }

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      {/* 상단: 게이지 + 핵심 수치 가로 배치 */}
      <div className="flex items-center gap-4 px-4 pt-4 pb-3 border-b border-white/[0.06]">
        {/* 게이지 */}
        <div className="flex-shrink-0 flex flex-col items-center">
          <div className="relative" style={{ width: SIZE, height: Math.round(SIZE * 0.68) }}>
            <svg
              width={SIZE}
              height={Math.round(SIZE * 0.68)}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              style={{ overflow: 'visible' }}
            >
              <path d={trackPath} fill="none" stroke="#27272a" strokeWidth={STROKE} strokeLinecap="round" />
              {progressPath && (
                <path d={progressPath} fill="none" stroke={arcColor} strokeWidth={STROKE} strokeLinecap="round" />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingTop: 10 }}>
              <div className="flex items-baseline gap-0.5">
                <span className="text-[30px] font-black leading-none tabular-nums text-white">
                  {total_cycles.toFixed(0)}
                </span>
                <span className="text-xs text-zinc-600 ml-0.5">회</span>
              </div>
              <div className="text-[9px] text-zinc-600 mt-0.5 text-center">누적 사이클</div>
            </div>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[9px] text-zinc-600">건강도</span>
            <span className="text-[11px] font-bold tabular-nums" style={{ color: arcColor }}>
              {healthPct.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* 오른쪽 수치들 */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] text-zinc-600 flex-shrink-0">누적 주행</span>
            <span className="text-[13px] font-bold tabular-nums text-green-400 truncate">
              {odometer_km.toLocaleString()} <span className="text-[10px] text-zinc-600 font-normal">km</span>
            </span>
          </div>
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] text-zinc-600 flex-shrink-0">에너지 환산{is_estimated ? <span className="text-amber-500 ml-0.5">추정</span> : ''}</span>
            <span className="text-[13px] font-bold tabular-nums text-zinc-400 truncate">
              {total_kwh.toLocaleString()} <span className="text-[10px] text-zinc-600 font-normal">kWh</span>
            </span>
          </div>
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] text-zinc-600 flex-shrink-0">배터리 용량</span>
            <span className="text-[13px] font-bold tabular-nums text-zinc-400">
              {battery_capacity_kwh.toFixed(1)} <span className="text-[10px] text-zinc-600 font-normal">kWh</span>
            </span>
          </div>
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] text-zinc-600 flex-shrink-0">목표 수명</span>
            <span className="text-[13px] font-bold tabular-nums text-zinc-500">
              {MAX_CYCLES.toLocaleString()} <span className="text-[10px] text-zinc-600 font-normal">회</span>
            </span>
          </div>
          <div className="mt-0.5 pt-2 border-t border-white/[0.04]">
            <div className="w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${progress * 100}%`, background: arcColor }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[8px] text-zinc-700">0</span>
              <span className="text-[8px] text-zinc-700">{(progress * 100).toFixed(1)}%</span>
              <span className="text-[8px] text-zinc-700">1500회</span>
            </div>
          </div>
        </div>
      </div>

      {/* 하단: 이번주 / 이번달 / 월평균 */}
      <div className="grid grid-cols-3">
        <div className={`text-center py-3 border-r border-white/[0.06] ${isEmpty ? 'opacity-40' : ''}`}>
          <div className="text-[10px] text-zinc-600 mb-1">이번주</div>
          <div className="text-sm font-extrabold tabular-nums text-blue-400">{formatCycles(this_week_cycles)}</div>
          <div className="text-[10px] text-zinc-600 mt-0.5">
            {isEmpty ? <span className="text-zinc-700">기록 없음</span> : <>회 ({this_week_kwh.toFixed(0)} kWh)</>}
          </div>
        </div>
        <div className={`text-center py-3 border-r border-white/[0.06] ${isEmpty ? 'opacity-40' : ''}`}>
          <div className="text-[10px] text-zinc-600 mb-1">이번달</div>
          <div className="text-sm font-extrabold tabular-nums text-indigo-400">{formatCycles(this_month_cycles)}</div>
          <div className="text-[10px] text-zinc-600 mt-0.5">
            {isEmpty ? <span className="text-zinc-700">기록 없음</span> : <>회 ({this_month_kwh.toFixed(0)} kWh)</>}
          </div>
        </div>
        <div className={`text-center py-3 ${isEmpty ? 'opacity-40' : ''}`}>
          <div className="text-[10px] text-zinc-600 mb-1">월 평균</div>
          <div className="text-sm font-extrabold tabular-nums text-amber-400">{formatCycles(avg_monthly_cycles)}</div>
          <div className="text-[10px] text-zinc-600 mt-0.5">
            {isEmpty ? <span className="text-zinc-700">기록 없음</span> : <>회</>}
          </div>
        </div>
      </div>
    </div>
  );
}
