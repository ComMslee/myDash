'use client';

import { useState, Fragment } from 'react';
import { KWH_PER_KM } from '@/lib/constants';
import { formatDuration } from '@/lib/format';

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

// 06~24h 막대 — 새벽(00~06)은 거의 안 쓰는 시간이라 윈도우 밖.
// 좌측 점: 06시 이전 시작 운행 존재 / 우측 점: 자정 넘김 운행 존재. 정확한 시각은 메타라인.
function DayTimelineBar({ items, dayStart }) {
  const visible = items.filter(d => !d.absorbed && d.start_date);
  if (!visible.length) return null;
  const dayMs = 18 * 3600000; // 06:00 ~ 24:00
  const hasEarly = visible.some(d => new Date(d.start_date) - dayStart < 0);
  const hasLate = visible.some(d => d.end_date && new Date(d.end_date) - dayStart > dayMs);
  return (
    <div className="flex items-center gap-1">
      <div className="w-1 flex-shrink-0 flex justify-center">
        {hasEarly && <div className="w-1 h-1 rounded-full bg-blue-400/70" />}
      </div>
      <div className="relative h-2.5 flex-1 bg-white/[0.04] rounded overflow-hidden">
        {visible.map(d => {
          const s = new Date(d.start_date) - dayStart;
          const eMs = d.end_date ? (new Date(d.end_date) - dayStart) : (s + 60000);
          if (eMs <= 0) return null; // 윈도우 밖(새벽만)
          const left = Math.max(0, Math.min(100, (s / dayMs) * 100));
          const right = Math.max(0, Math.min(100, (eMs / dayMs) * 100));
          const width = Math.max(0.4, right - left);
          return (
            <div
              key={d.id}
              className="absolute inset-y-0 bg-blue-400/80"
              style={{ left: `${left}%`, width: `${width}%` }}
            />
          );
        })}
      </div>
      <div className="w-1 flex-shrink-0 flex justify-center">
        {hasLate && <div className="w-1 h-1 rounded-full bg-blue-400/70" />}
      </div>
    </div>
  );
}

/**
 * 월 그룹 → 일 카드 (스캔용 상단 리스트).
 * 일 카드 탭 → onDayClick(dateStr) — page.js 가 dayMode 진입 (지도+컴팩트 strip).
 * 월 헤더 탭 → onMonthClick(mk) (있으면 monthMode 진입), 우측 chevron 은 펼침 토글.
 */
export default function DriveListView({
  drives, loadingDrives, error,
  onDayClick, onMonthClick,
  driveDayStr,
}) {
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
    if (!d.absorbed) {
      g.distance += parseFloat(d.distance) || 0;
      if (d.start_rated_range_km && d.end_rated_range_km) {
        const usedKm = parseFloat(d.start_rated_range_km) - parseFloat(d.end_rated_range_km);
        if (usedKm > 0) g.kwh += usedKm * KWH_PER_KM;
      }
      if (d.start_battery_level != null && d.end_battery_level != null) {
        g.usedPct += Math.max(0, d.start_battery_level - d.end_battery_level);
      }
    }
  });

  // 월별 묶음 (순서 보존)
  const monthOrder = [];
  const monthMap = new Map();
  groups.forEach(g => {
    const mk = g.dateStr.slice(0, 7);
    let m = monthMap.get(mk);
    if (!m) {
      m = { mk, days: [], distance: 0, kwh: 0, usedPct: 0, driveCount: 0 };
      monthMap.set(mk, m);
      monthOrder.push(mk);
    }
    m.days.push(g);
    m.distance += g.distance;
    m.kwh += g.kwh;
    m.usedPct += g.usedPct;
    m.driveCount += g.items.filter(d => !d.absorbed).length;
  });

  // 일 카드 — 24h 막대 + 시간 범위/운전·정차 시간/총량.
  const renderDayCard = (g) => {
    const weekday = WEEKDAY_KO[g.firstDate.getDay()];
    const visible = g.items.filter(d => !d.absorbed);
    if (!visible.length) return null;
    const driveCount = visible.length;
    const sortedAsc = [...visible].sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    const first = sortedAsc[0];
    const last = sortedAsc[sortedAsc.length - 1];
    const fmt = (s) => { const dt = new Date(s); return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`; };
    const driveTotalMin = visible.reduce((s, d) => s + (parseFloat(d.duration_min) || 0), 0);
    // 정차시간 = drive 사이 gap 합 (양수만)
    let stayMin = 0;
    for (let i = 1; i < sortedAsc.length; i++) {
      const prev = sortedAsc[i - 1];
      const cur = sortedAsc[i];
      if (prev.end_date && cur.start_date) {
        const gap = (new Date(cur.start_date) - new Date(prev.end_date)) / 60000;
        if (gap > 0) stayMin += gap;
      }
    }
    const dayStart = new Date(g.firstDate);
    dayStart.setHours(6, 0, 0, 0); // 막대 윈도우 시작 = 06:00 (00~06 새벽은 점 indicator)
    const dayMs = 18 * 3600000;
    const isEarly = new Date(first.start_date).getHours() < 6;
    const isLateEnd = last.end_date && (new Date(last.end_date) - dayStart) > dayMs; // 자정 넘김 종료
    return (
      <button
        key={g.key}
        type="button"
        onClick={() => onDayClick(g.dateStr)}
        className="w-full text-left flex flex-col gap-2 px-3 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.025] active:bg-blue-500/10 transition-colors"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-zinc-200 tabular-nums flex-shrink-0">
            {g.firstDate.getMonth() + 1}/{g.firstDate.getDate()}
            <span className="text-[10px] text-zinc-600 font-normal ml-0.5">({weekday})</span>
          </span>
          <div className="text-right tabular-nums flex-shrink-0">
            <span className="text-sm font-bold text-blue-400">{g.distance.toFixed(0)}<span className="text-[10px] text-zinc-600 ml-0.5">km</span></span>
            {g.kwh > 0 && (
              <span className="text-xs text-green-400/80 ml-2">
                {g.kwh.toFixed(1)}<span className="ml-0.5">kWh</span>
                {g.usedPct > 0 && <span className="text-zinc-500 ml-1">({g.usedPct}%)</span>}
              </span>
            )}
          </div>
        </div>
        <DayTimelineBar items={visible} dayStart={dayStart} />
        <div className="flex items-center gap-2 text-[11px] text-zinc-500 tabular-nums flex-wrap">
          <span>{isEarly && <span className="mr-0.5">🌙</span>}{fmt(first.start_date)} → {fmt(last.end_date || last.start_date)}{isLateEnd && <span className="ml-0.5">🌙</span>}</span>
          <span className="text-zinc-700">·</span>
          <span>주행 {driveCount}회</span>
          {driveTotalMin > 0 && (
            <>
              <span className="text-zinc-700">·</span>
              <span>운전 {formatDuration(Math.round(driveTotalMin))}</span>
            </>
          )}
          {stayMin > 0 && (
            <>
              <span className="text-zinc-700">·</span>
              <span>정차 {formatDuration(Math.round(stayMin))}</span>
            </>
          )}
        </div>
      </button>
    );
  };

  // 일 카드 사이 gap — 이전 일 첫 출발 - 다음 일 마지막 도착 (drives 는 reverse-chronological).
  const renderCrossDayGap = (curG, nextG, key) => {
    const curOldest = curG.items[curG.items.length - 1];
    const nextNewest = nextG.items[0];
    if (!curOldest?.start_date || !nextNewest?.end_date) return null;
    const ms = new Date(curOldest.start_date) - new Date(nextNewest.end_date);
    if (ms <= 0) return null;
    return (
      <div key={key} className="flex items-center gap-2 px-3 py-1 bg-black/40 border-y border-white/[0.06]">
        <div className="flex-1 h-px bg-white/[0.06]" />
        <span className="text-[10px] text-zinc-600 tabular-nums">{formatDuration(Math.round(ms / 60000))}</span>
        <div className="flex-1 h-px bg-white/[0.06]" />
      </div>
    );
  };

  return (
    <>
      {monthOrder.map(mk => {
        const m = monthMap.get(mk);
        const expanded = expandedMonths.has(mk);
        return (
          <Fragment key={mk}>
            {/* 월 헤더 — 큰 영역=상세보기 / 우측 chevron=펼치기 */}
            <div className="flex items-stretch border-t border-white/[0.10] bg-white/[0.04]">
              <button
                onClick={() => (onMonthClick ? onMonthClick(mk) : toggleMonth(mk))}
                className="flex-1 flex items-center gap-2 px-3 py-2 hover:bg-white/[0.05] active:bg-white/[0.08] transition-colors text-left min-w-0"
                title={onMonthClick ? '이 달 전체 지도/순위 보기' : (expanded ? '접기' : '펼치기')}
              >
                <span className="text-xs font-bold text-zinc-300 flex-shrink-0">{formatMonthLabel(mk)}</span>
                <span className="text-[10px] text-zinc-600 tabular-nums truncate">
                  {m.driveCount}회 · {m.distance.toFixed(0)}km
                  {m.usedPct > 0 && <span className="text-zinc-700"> · {m.usedPct}%</span>}
                </span>
              </button>
              <button
                onClick={() => toggleMonth(mk)}
                className="px-3 flex items-center text-zinc-500 border-l border-white/[0.06] hover:bg-white/[0.05] active:bg-white/[0.08] transition-colors"
                title={expanded ? '접기' : '펼치기'}
              >
                <svg className={`w-3 h-3 transition-transform ${expanded ? '' : '-rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            {expanded && m.days.flatMap((g, idx) => {
              const nextDay = idx + 1 < m.days.length ? m.days[idx + 1] : null;
              const nodes = [renderDayCard(g)];
              if (nextDay) {
                const gapNode = renderCrossDayGap(g, nextDay, g.key + '-xgap');
                if (gapNode) nodes.push(gapNode);
              }
              return nodes;
            })}
          </Fragment>
        );
      })}
    </>
  );
}
