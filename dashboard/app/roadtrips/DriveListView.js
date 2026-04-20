'use client';

import { KWH_PER_KM } from '../../lib/constants';
import { formatDuration, shortAddr } from '../../lib/format';

function efficiency(d) {
  if (!d.start_rated_range_km || !d.end_rated_range_km || !d.distance) return null;
  const dist = parseFloat(d.distance);
  const usedKm = parseFloat(d.start_rated_range_km) - parseFloat(d.end_rated_range_km);
  if (usedKm <= 0 || !dist || dist === 0) return null;
  const kwh = (usedKm * KWH_PER_KM).toFixed(1);
  const perKm = ((usedKm * KWH_PER_KM * 1000) / dist).toFixed(0);
  return { kwh, perKm };
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

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

  // 날짜별 그룹핑 (순서 보존)
  const groups = [];
  let currentKey = null;
  drives.forEach(d => {
    const dt = new Date(d.start_date);
    const key = dt.toDateString();
    if (key !== currentKey) {
      groups.push({ key, dateStr: driveDayStr(d), firstDate: dt, items: [], distance: 0, kwh: 0, usedPct: 0 });
      currentKey = key;
    }
    const g = groups[groups.length - 1];
    g.items.push(d);
    g.distance += parseFloat(d.distance) || 0;
    if (d.start_rated_range_km && d.end_rated_range_km) {
      const usedKm = parseFloat(d.start_rated_range_km) - parseFloat(d.end_rated_range_km);
      if (usedKm > 0) g.kwh += usedKm * KWH_PER_KM;
    }
    if (d.start_battery_level != null && d.end_battery_level != null) {
      g.usedPct += Math.max(0, d.start_battery_level - d.end_battery_level);
    }
  });

  return groups.flatMap((g, gi) => {
    const weekday = WEEKDAY_KO[g.firstDate.getDay()];
    const multi = g.items.length > 1;

    // 그룹 사이 대기 시간 (이전 날 첫 주행 end → 이번 날 마지막 주행 start)
    const nextG = groups[gi + 1];
    let crossGap = null;
    if (nextG) {
      const curOldest = g.items[g.items.length - 1];
      const nextNewest = nextG.items[0];
      if (curOldest?.start_date && nextNewest?.end_date) {
        const ms = new Date(curOldest.start_date) - new Date(nextNewest.end_date);
        if (ms > 0) crossGap = formatDuration(Math.round(ms / 60000));
      }
    }

    const groupNode = (
      <div key={g.key} className="flex">
        {/* 좌측 날짜 박스 — 일 합계 탭 */}
        <button
          type="button"
          onClick={() => onDayClick(g.dateStr)}
          className="flex-shrink-0 w-16 bg-white/[0.02] hover:bg-white/[0.05] active:bg-blue-500/10 border-r border-white/[0.06] flex flex-col items-center justify-center py-2.5 gap-0.5 tabular-nums transition-colors"
        >
          <span className="text-sm font-bold text-zinc-300 leading-none">
            {g.firstDate.getMonth() + 1}/{g.firstDate.getDate()}
            <span className="text-[10px] text-zinc-600 font-normal ml-0.5">({weekday})</span>
          </span>
          {multi && (
            <>
              <span className="text-[10px] font-bold text-blue-400 leading-none mt-2">
                {g.distance.toFixed(0)}<span className="text-zinc-600 font-normal ml-0.5">km</span>
              </span>
              {g.usedPct > 0 && (
                <span className="text-[10px] text-zinc-500 leading-none mt-0.5">{g.usedPct}%</span>
              )}
            </>
          )}
        </button>

        {/* 우측 주행 목록 */}
        <div className="flex-1 min-w-0">
          {g.items.map((d, iidx) => {
            const eff = efficiency(d);
            const dt = new Date(d.start_date);
            const timeLabel = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
            const endTime = d.end_date
              ? `${String(new Date(d.end_date).getHours()).padStart(2, '0')}:${String(new Date(d.end_date).getMinutes()).padStart(2, '0')}`
              : null;
            const startPct = d.start_battery_level ?? null;
            const endPct = d.end_battery_level ?? null;
            const usedPct = (startPct != null && endPct != null) ? Math.max(0, startPct - endPct) : 0;

            // 같은 날 내에서만 대기 시간 표시
            const next = g.items[iidx + 1];
            let gapLabel = null;
            if (next && d.start_date && next.end_date) {
              const gapMs = new Date(d.start_date) - new Date(next.end_date);
              if (gapMs > 0) gapLabel = formatDuration(Math.round(gapMs / 60000));
            }

            return (
              <div key={d.id}>
                <button
                  onClick={() => onDriveClick(d)}
                  className="w-full text-left grid grid-cols-[44px_1fr_auto] items-center gap-2 px-3 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.025] active:bg-blue-500/10 transition-colors"
                >
                  <div className="text-xs text-zinc-500 tabular-nums leading-tight">
                    <p>{timeLabel}</p>
                    {endTime && <p className="text-zinc-600">{endTime}</p>}
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
                  <div className="flex items-center gap-2 px-3 py-0.5 bg-[#111]">
                    <div className="flex-1 h-px bg-white/[0.04]" />
                    <span className="text-xs text-zinc-600 tabular-nums">{gapLabel}</span>
                    <div className="flex-1 h-px bg-white/[0.04]" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );

    const nodes = [groupNode];
    if (crossGap) {
      nodes.push(
        <div key={g.key + '-xgap'} className="flex items-center gap-2 px-3 py-1 bg-black/40 border-y border-white/[0.08]">
          <div className="flex-1 h-px bg-white/[0.06]" />
          <span className="text-[10px] text-zinc-600 tabular-nums">{crossGap}</span>
          <div className="flex-1 h-px bg-white/[0.06]" />
        </div>
      );
    }
    return nodes;
  });
}
