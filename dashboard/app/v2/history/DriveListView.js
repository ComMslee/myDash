'use client';

import { useState, Fragment } from 'react';
import { KWH_PER_KM } from '@/lib/constants';
import { formatDuration, shortAddr } from '@/lib/format';

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

// KST 기준 현재 'YYYY-MM' — 이번 달 펼침 기본값 계산용
function currentMonthKey() {
  const kst = new Date(Date.now() + 9 * 3600000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`;
}

// 'YYYY-MM' → '24/03 (3월)' 라벨 (현재 연도면 연도 생략)
function formatMonthLabel(mk) {
  const [y, m] = mk.split('-');
  const currentYear = new Date().getFullYear();
  const yLabel = parseInt(y) === currentYear ? '' : `${y.slice(2)}년 `;
  return `${yLabel}${parseInt(m)}월`;
}

export default function DriveListView({ drives, loadingDrives, error, onDriveClick, onDayClick, onMonthClick, driveDayStr }) {
  const [expandedMonths, setExpandedMonths] = useState(() => new Set([currentMonthKey()]));
  const toggleMonth = (mk) => setExpandedMonths(prev => {
    const next = new Set(prev);
    if (next.has(mk)) next.delete(mk); else next.add(mk);
    return next;
  });

  if (loadingDrives) {
    return (
      <div className="flex items-center justify-center h-24">
        <div className="w-6 h-6 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }
  if (error) return <p className="text-red-400 text-sm text-center py-4">{error}</p>;
  if (!drives.length) return <p className="text-zinc-500 text-sm text-center py-4">주행 기록이 없습니다</p>;

  // 일별 그룹핑 (순서 보존)
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

  // 월별 묶음 (순서 보존)
  const monthOrder = [];
  const monthMap = new Map();
  groups.forEach((g, gi) => {
    const mk = g.dateStr.slice(0, 7);
    let m = monthMap.get(mk);
    if (!m) {
      m = { mk, days: [], dayIdx: [], distance: 0, kwh: 0, usedPct: 0, driveCount: 0 };
      monthMap.set(mk, m);
      monthOrder.push(mk);
    }
    m.days.push(g);
    m.dayIdx.push(gi);
    m.distance += g.distance;
    m.kwh += g.kwh;
    m.usedPct += g.usedPct;
    m.driveCount += g.items.length;
  });

  // 일별 그룹 노드 렌더링 (기존 로직 — gi는 전체 groups 인덱스, crossGap은 같은 달 내에서만)
  const renderDay = (g, gi, sameMonthNext) => {
    const weekday = WEEKDAY_KO[g.firstDate.getDay()];
    const multi = g.items.length > 1;

    let crossGap = null;
    if (sameMonthNext) {
      const curOldest = g.items[g.items.length - 1];
      const nextNewest = sameMonthNext.items[0];
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
          className="flex-shrink-0 w-[72px] bg-white/[0.02] hover:bg-white/[0.05] active:bg-blue-500/10 border-r border-white/[0.06] flex flex-col items-center justify-center py-2.5 tabular-nums transition-colors"
        >
          <span className="text-sm font-bold text-zinc-300 leading-none">
            {g.firstDate.getMonth() + 1}/{g.firstDate.getDate()}
            <span className="text-[10px] text-zinc-600 font-normal ml-0.5">({weekday})</span>
          </span>
          {multi && (
            <>
              <span aria-hidden="true" className="block h-3" />
              <span className="text-[11px] font-bold text-blue-400 leading-none">
                {g.distance.toFixed(0)}<span className="text-zinc-600 font-normal ml-0.5">km</span>
              </span>
              {g.usedPct > 0 && (
                <span className="text-[10px] text-zinc-500 leading-none mt-1">{g.usedPct}%</span>
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
  };

  return (
    <>
      {monthOrder.map(mk => {
        const m = monthMap.get(mk);
        const expanded = expandedMonths.has(mk);
        return (
          <Fragment key={mk}>
            {/* 월 헤더 — chevron 토글(좌) + 상세보기 버튼(우) */}
            <div className="flex items-stretch border-t border-white/[0.10] bg-white/[0.04]">
              <button
                onClick={() => toggleMonth(mk)}
                className="flex-1 flex items-center gap-2 px-3 py-2 hover:bg-white/[0.05] active:bg-white/[0.08] transition-colors text-left min-w-0"
              >
                <svg className={`w-3 h-3 text-zinc-500 flex-shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                <span className="text-xs font-bold text-zinc-300 flex-shrink-0">{formatMonthLabel(mk)}</span>
                <span className="text-[10px] text-zinc-600 tabular-nums truncate">
                  {m.driveCount}회 · {m.distance.toFixed(0)}km
                  {m.usedPct > 0 && <span className="text-zinc-700"> · {m.usedPct}%</span>}
                </span>
              </button>
              {onMonthClick && (
                <button
                  onClick={() => onMonthClick(mk)}
                  className="px-3 flex items-center text-[11px] text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 border-l border-white/[0.06] transition-colors"
                  title="이 달 전체 지도/순위 보기"
                >
                  상세보기
                </button>
              )}
            </div>
            {expanded && m.days.flatMap((g, idx) => {
              const gi = m.dayIdx[idx];
              const sameMonthNext = idx + 1 < m.days.length ? m.days[idx + 1] : null;
              return renderDay(g, gi, sameMonthNext);
            })}
          </Fragment>
        );
      })}
    </>
  );
}
