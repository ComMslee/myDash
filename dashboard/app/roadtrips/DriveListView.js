'use client';

import { KWH_PER_KM } from '../../lib/constants';
import { formatDuration, shortAddr } from '../../lib/format';

function efficiency(d) {
  if (!d.start_rated_range_km || !d.end_rated_range_km || !d.distance) return null;
  const dist = parseFloat(d.distance);
  const usedKm = parseFloat(d.start_rated_range_km) - parseFloat(d.end_rated_range_km);
  if (usedKm <= 0 || !dist || dist === 0) return null;
  const kwh = (usedKm * KWH_PER_KM).toFixed(1);
  const perKm = ((usedKm * KWH_PER_KM * 1000) / dist).toFixed(0); // Wh/km
  return { kwh, perKm };
}

/**
 * 로드트립 목록 모드.
 * - drives: 주행 목록 (내림차순)
 * - onDriveClick(drive): 단일 주행 지도 뷰로 이동
 * - onDayClick(dateStr 'YYYY-MM-DD'): 해당 일 합계 지도 뷰로 이동
 * - driveDayStr(drive): 로컬 타임존 기준 YYYY-MM-DD 문자열 (page와 동일 헬퍼 공유)
 */
export default function DriveListView({ drives, loadingDrives, error, onDriveClick, onDayClick, driveDayStr }) {
  if (loadingDrives) {
    return (
      <div className="flex items-center justify-center h-24">
        <div className="w-6 h-6 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }
  if (error) return <p className="text-red-400 text-sm text-center py-4">{error}</p>;
  if (!drives.length) return <p className="text-zinc-500 text-sm text-center py-4">주행 기록이 없습니다</p>;

  // 날짜별 합계 사전 집계
  const dailyTotals = {};
  drives.forEach(d => {
    const dt = new Date(d.start_date);
    const key = dt.toDateString();
    if (!dailyTotals[key]) dailyTotals[key] = { distance: 0, kwh: 0, usedPct: 0 };
    dailyTotals[key].distance += parseFloat(d.distance) || 0;
    if (d.start_rated_range_km && d.end_rated_range_km) {
      const usedKm = parseFloat(d.start_rated_range_km) - parseFloat(d.end_rated_range_km);
      if (usedKm > 0) dailyTotals[key].kwh += usedKm * KWH_PER_KM;
    }
    if (d.start_battery_level != null && d.end_battery_level != null) {
      dailyTotals[key].usedPct += Math.max(0, d.start_battery_level - d.end_battery_level);
    }
  });

  return drives.map((d, idx) => {
    const eff = efficiency(d);
    const dt = new Date(d.start_date);
    const dateLabel = `${dt.getMonth()+1}/${dt.getDate()}`;
    const timeLabel = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    const startPct = d.start_battery_level ?? null;
    const endPct = d.end_battery_level ?? null;
    const usedPct = (startPct != null && endPct != null) ? Math.max(0, startPct - endPct) : 0;

    // 날짜 구분선
    const prevDt = idx > 0 ? new Date(drives[idx - 1].start_date) : null;
    const showDateHeader = !prevDt || dt.toDateString() !== prevDt.toDateString();
    const dayTotal = showDateHeader ? dailyTotals[dt.toDateString()] : null;

    // 대기 시간
    let gapLabel = null;
    if (idx < drives.length - 1 && d.start_date && drives[idx + 1].end_date) {
      const gapMs = new Date(d.start_date) - new Date(drives[idx + 1].end_date);
      if (gapMs > 0) {
        const gapMin = Math.round(gapMs / 60000);
        gapLabel = formatDuration(gapMin);
      }
    }

    return (
      <div key={d.id}>
        {showDateHeader && (
          <button
            type="button"
            onClick={() => onDayClick(driveDayStr(d))}
            className="w-full px-4 py-2 bg-white/[0.02] border-b border-white/[0.06] flex items-center justify-between hover:bg-white/[0.05] active:bg-blue-500/10 transition-colors"
          >
            <span className="text-[11px] font-bold text-zinc-500">{dt.getMonth()+1}월 {dt.getDate()}일</span>
            {dayTotal && (
              <div className="flex items-center gap-2 tabular-nums">
                <span className="text-[10px] font-bold text-blue-400">{dayTotal.distance.toFixed(1)}<span className="text-zinc-600 font-normal ml-0.5">km</span></span>
                {dayTotal.usedPct > 0 && (
                  <span className="text-[10px] text-zinc-500">{dayTotal.usedPct}%</span>
                )}
              </div>
            )}
          </button>
        )}
        <button
          onClick={() => onDriveClick(d)}
          className="w-full text-left grid grid-cols-[52px_1fr_auto] items-center gap-2 px-4 py-3 border-b border-white/[0.06] last:border-0 hover:bg-white/[0.025] active:bg-blue-500/10 transition-all"
        >
          <div className="text-xs text-zinc-500 tabular-nums leading-tight">
            <p>{timeLabel}</p>
            {d.end_date && <p>{`${String(new Date(d.end_date).getHours()).padStart(2,'0')}:${String(new Date(d.end_date).getMinutes()).padStart(2,'0')}`}</p>}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-zinc-300 truncate">
              {shortAddr(d.start_address) || '?'}<span className="text-zinc-600 mx-1">→</span>{shortAddr(d.end_address) || '?'}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-zinc-600 tabular-nums">{formatDuration(d.duration_min)}</span>
              {startPct != null && endPct != null && (
                <div className="flex items-center gap-1 text-xs text-zinc-500 tabular-nums">
                  <div className="w-20 h-1.5 bg-zinc-800 rounded-sm overflow-hidden relative">
                    <div className="absolute inset-y-0 rounded-sm bg-blue-400/30" style={{ left: `${endPct}%`, width: `${startPct - endPct}%` }} />
                    <div className="absolute inset-y-0 rounded-sm bg-green-400/40" style={{ left: 0, width: `${endPct}%` }} />
                  </div>
                  <span>{startPct}<span className="text-zinc-600">{'>'}</span>{endPct}%</span>
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-blue-400 tabular-nums">{d.distance}<span className="text-xs font-medium text-zinc-600 ml-0.5">km</span></p>
            {eff && (
              <p className="text-xs text-green-400/80 tabular-nums">
                {eff.kwh}<span className="ml-0.5">kWh</span>
                {usedPct > 0 && <span className="text-zinc-500 ml-1">({usedPct}%)</span>}
              </p>
            )}
          </div>
        </button>
        {gapLabel && (
          <div className="flex items-center gap-2 px-4 py-0.5 bg-[#111]">
            <div className="flex-1 h-px bg-white/[0.04]" />
            <span className="text-xs text-zinc-600 tabular-nums">{gapLabel}</span>
            <div className="flex-1 h-px bg-white/[0.04]" />
          </div>
        )}
      </div>
    );
  });
}
