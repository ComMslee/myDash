'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import { KWH_PER_KM } from '@/lib/constants';
import { formatDuration, formatHm } from '@/lib/format';
import { KST_OFFSET_MS, kstMondayStr } from '@/lib/kst';
import { Icon } from '../../lib/Icons';

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

// KST 기준 현재 'YYYY-MM' — 이번 달 펼침 기본값 계산용
function currentMonthKey() {
  const kst = new Date(Date.now() + KST_OFFSET_MS);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`;
}

// KST 기준 현재 주의 월요일 'YYYY-MM-DD' — 이번 주 펼침 기본값
function currentWeekKey() {
  return kstMondayStr(Date.now());
}

// 'YYYY-MM' → '24/03 (3월)' 라벨 (현재 연도면 연도 생략)
function formatMonthLabel(mk) {
  const [y, m] = mk.split('-');
  const currentYear = new Date().getFullYear();
  const yLabel = parseInt(y) === currentYear ? '' : `${y.slice(2)}년 `;
  return `${yLabel}${parseInt(m)}월`;
}

// 주 헤더 라벨 — 월 안에서 보이는 일자 범위 'M/D ~ M/D' (단일 날짜면 'M/D').
function formatWeekRange(daysInWeek) {
  if (!daysInWeek.length) return '';
  const sorted = [...daysInWeek].sort((a, b) => a.firstDate - b.firstDate);
  const first = sorted[0].firstDate;
  const last = sorted[sorted.length - 1].firstDate;
  const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  if (first.toDateString() === last.toDateString()) return fmt(first);
  return `${fmt(first)} ~ ${fmt(last)}`;
}

// 강화된 통계 라인 — kWh / 총 운전시간 / 평균 거리·회 / 효율 / 운행일수.
// 일 카드와 일관된 아이콘·색 (kWh 초록, 효율 앰버, 운전 road, 일 calendar).
function StatsLine({ kwh, durationMin, distance, driveCount, dayCount, efficiency = null }) {
  const items = [];
  if (kwh > 0) items.push({ k: 'kwh', node: (
    <span className="inline-flex items-baseline gap-0.5 text-green-400/90">
      <Icon name="bolt" className="w-3 h-3 self-center" />
      <span className="font-semibold">{kwh.toFixed(1)}</span><span className="text-zinc-600 ml-0.5">kWh</span>
    </span>
  ) });
  if (durationMin > 0) items.push({ k: 'dur', node: (
    <span className="inline-flex items-baseline gap-0.5">
      <Icon name="road" className="w-3 h-3 self-center" />
      {formatHm(Math.round(durationMin))}
    </span>
  ) });
  if (driveCount > 0 && distance > 0) {
    const avg = distance / driveCount;
    items.push({ k: 'avg', node: (
      <span>{avg < 10 ? avg.toFixed(1) : Math.round(avg)}<span className="text-zinc-600 ml-0.5">km/회</span></span>
    ) });
  }
  if (efficiency != null) items.push({ k: 'eff', node: (
    <span className="text-amber-400/80">{Math.round(efficiency)}<span className="text-zinc-600 ml-0.5">Wh/km</span></span>
  ) });
  if (dayCount > 0) items.push({ k: 'days', node: (
    <span className="inline-flex items-baseline gap-0.5">
      <Icon name="calendar" className="w-3 h-3 self-center" />
      {dayCount}일
    </span>
  ) });
  if (!items.length) return null;
  return (
    <span className="text-[10px] text-zinc-500 tabular-nums flex items-center gap-1.5 flex-wrap">
      {items.map((it, i) => (
        <Fragment key={it.k}>
          {i > 0 && <span className="text-zinc-700">·</span>}
          {it.node}
        </Fragment>
      ))}
    </span>
  );
}

// Chevron — 월/주 공통 (크기만 다름)
function Chevron({ expanded, size = 'w-4 h-4' }) {
  return (
    <svg className={`${size} transition-transform ${expanded ? '' : '-rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// 카드 풀배경 그라데이션 — 06~23h 윈도우. 운행 구간만 아래쪽이 짙고 위로 페이드.
// 별도 막대 행 없이 카드 자체가 타임라인. 새벽/심야 점은 메타라인의 🌙 emoji 가 흡수.
function DayBgGradient({ items, dayStart, dayMs }) {
  const visible = items.filter(d => !d.absorbed && d.start_date);
  if (!visible.length) return null;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {visible.map(d => {
        const s = new Date(d.start_date) - dayStart;
        const eMs = d.end_date ? (new Date(d.end_date) - dayStart) : (s + 60000);
        if (eMs <= 0) return null; // 윈도우 밖(새벽만)
        const left = Math.max(0, Math.min(100, (s / dayMs) * 100));
        const right = Math.max(0, Math.min(100, (eMs / dayMs) * 100));
        const width = Math.max(0, right - left);
        return (
          <div
            key={d.id}
            className="absolute inset-y-0"
            style={{
              left: `${left}%`,
              width: `max(4px, ${width}%)`,
              background: 'linear-gradient(to top, rgba(96,165,250,0.32) 0%, rgba(96,165,250,0.32) 10%, rgba(96,165,250,0) 30%, transparent 100%)',
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * 월 그룹 → 주 그룹 → 일 카드 (3단 계층).
 * - 월 헤더: 좌측 영역 onMonthClick(monthMode 지도) · 우측 chevron toggle
 * - 주 헤더: 전체 영역 toggle (월 안에서 보이는 일자 범위만 표시)
 * - 일 카드 탭 → onDayClick(dateStr) — dayMode 지도+컴팩트 strip 진입
 */
export default function DriveListView({
  drives, loadingDrives, error,
  onDayClick, onMonthClick, onWeekClick,
  driveDayStr,
}) {
  const [expandedMonths, setExpandedMonths] = useState(() => new Set([currentMonthKey()]));
  const [expandedWeeks, setExpandedWeeks] = useState(() => new Set([currentWeekKey()]));
  const toggleMonth = (mk) => setExpandedMonths(prev => {
    const next = new Set(prev);
    if (next.has(mk)) next.delete(mk); else next.add(mk);
    return next;
  });
  const toggleWeek = (wk) => setExpandedWeeks(prev => {
    const next = new Set(prev);
    if (next.has(wk)) next.delete(wk); else next.add(wk);
    return next;
  });
  const todayWeekKey = useMemo(() => currentWeekKey(), []);

  // 공휴일 — drives 에 등장하는 연도들만 /api/holidays?year= 으로 로드. KST 기준 YYYYMMDD.
  const yearsKey = useMemo(() => {
    const ys = new Set();
    for (const d of drives) {
      if (!d?.start_date) continue;
      const t = new Date(d.start_date).getTime() + KST_OFFSET_MS;
      ys.add(new Date(t).getUTCFullYear());
    }
    return Array.from(ys).sort().join(',');
  }, [drives]);
  const [holidayMap, setHolidayMap] = useState(new Map());
  useEffect(() => {
    if (!yearsKey) return;
    const years = yearsKey.split(',').filter(Boolean);
    let alive = true;
    Promise.all(years.map(y =>
      fetch(`/api/holidays?year=${y}`).then(r => r.ok ? r.json() : null).catch(() => null)
    )).then(results => {
      if (!alive) return;
      const map = new Map();
      for (const data of results) {
        for (const h of data?.holidays || []) map.set(h.dateymd, h.name);
      }
      setHolidayMap(map);
    });
    return () => { alive = false; };
  }, [yearsKey]);

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
      groups.push({ key, dateStr: driveDayStr(d), firstDate: dt, items: [], distance: 0, kwh: 0, usedPct: 0, durationMin: 0 });
      currentKey = key;
    }
    const g = groups[groups.length - 1];
    g.items.push(d);
    if (!d.absorbed) {
      g.distance += parseFloat(d.distance) || 0;
      g.durationMin += parseFloat(d.duration_min) || 0;
      if (d.start_rated_range_km && d.end_rated_range_km) {
        const usedKm = parseFloat(d.start_rated_range_km) - parseFloat(d.end_rated_range_km);
        if (usedKm > 0) g.kwh += usedKm * KWH_PER_KM;
      }
      if (d.start_battery_level != null && d.end_battery_level != null) {
        g.usedPct += Math.max(0, d.start_battery_level - d.end_battery_level);
      }
    }
  });

  // 월별 묶음 + 월 내부 주별 묶음 (kstMondayStr 기준, ISO 월~일)
  const monthOrder = [];
  const monthMap = new Map();
  groups.forEach(g => {
    const mk = g.dateStr.slice(0, 7);
    const wk = kstMondayStr(`${g.dateStr}T00:00:00Z`);
    let m = monthMap.get(mk);
    if (!m) {
      m = {
        mk, days: [], distance: 0, kwh: 0, usedPct: 0, driveCount: 0, durationMin: 0,
        weekOrder: [], weekMap: new Map(),
      };
      monthMap.set(mk, m);
      monthOrder.push(mk);
    }
    m.days.push(g);
    m.distance += g.distance;
    m.kwh += g.kwh;
    m.usedPct += g.usedPct;
    m.driveCount += g.items.filter(d => !d.absorbed).length;
    m.durationMin += g.durationMin;

    let w = m.weekMap.get(wk);
    if (!w) {
      w = { weekKey: wk, days: [], distance: 0, kwh: 0, usedPct: 0, driveCount: 0, durationMin: 0 };
      m.weekMap.set(wk, w);
      m.weekOrder.push(wk);
    }
    w.days.push(g);
    w.distance += g.distance;
    w.kwh += g.kwh;
    w.usedPct += g.usedPct;
    w.driveCount += g.items.filter(d => !d.absorbed).length;
    w.durationMin += g.durationMin;
  });

  // 일 카드 — 24h 막대 + 시간 범위/운전·정차 시간/총량.
  const renderDayCard = (g) => {
    const dow = g.firstDate.getDay();
    const weekday = WEEKDAY_KO[dow];
    const ymd = g.dateStr.replace(/-/g, '');
    const holidayName = holidayMap.get(ymd) || null;
    const isHoliday = !!holidayName;
    const isSun = dow === 0;
    const isSat = dow === 6;
    // 공휴일은 일요일과 동일 톤 (로즈). 평일 공휴일 강조용.
    const useRose = isSun || isHoliday;
    const dateCls = useRose ? 'text-rose-400' : isSat ? 'text-sky-400' : 'text-zinc-200';
    const dowCls  = useRose ? 'text-rose-400/70' : isSat ? 'text-sky-400/70' : 'text-zinc-600';
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
    const dayMs = 17 * 3600000;
    const isEarly = new Date(first.start_date).getHours() < 6;
    const isLateEnd = last.end_date && (new Date(last.end_date) - dayStart) > dayMs; // 자정 넘김 종료
    return (
      <button
        key={g.key}
        type="button"
        onClick={() => onDayClick(g.dateStr)}
        title={holidayName || undefined}
        className="relative w-full text-left flex flex-col gap-1 px-3 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.025] active:bg-blue-500/10 transition-colors"
      >
        <DayBgGradient items={visible} dayStart={dayStart} dayMs={dayMs} />
        <div className="relative flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2 min-w-0 flex-shrink">
            <span className={`text-sm font-bold tabular-nums flex-shrink-0 ${dateCls}`}>
              {g.firstDate.getMonth() + 1}/{g.firstDate.getDate()}
              <span className={`text-[10px] font-normal ml-0.5 ${dowCls}`}>({weekday})</span>
            </span>
            {holidayName && (
              <span className="text-[10px] text-rose-400/90 truncate" title={holidayName}>
                {holidayName}
              </span>
            )}
            <span className="text-[11px] text-zinc-500 tabular-nums truncate">
              {isEarly && <Icon name="moon" className="w-4 h-4 inline-block align-middle mr-0.5" />}{fmt(first.start_date)} → {fmt(last.end_date || last.start_date)}{isLateEnd && <Icon name="moon" className="w-4 h-4 inline-block align-middle ml-0.5" />}
            </span>
          </div>
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
        <div className="relative flex items-center gap-2 text-[11px] text-zinc-500 tabular-nums flex-wrap">
          <span title="주행" className="inline-flex items-center gap-0.5"><Icon name="car" />{driveCount}회</span>
          {driveTotalMin > 0 && (
            <>
              <span className="text-zinc-700">·</span>
              <span title="운전" className="inline-flex items-center gap-0.5"><Icon name="road" />{formatHm(Math.round(driveTotalMin))}</span>
            </>
          )}
          {stayMin > 0 && (
            <>
              <span className="text-zinc-700">·</span>
              <span title="정차" className="inline-flex items-center gap-0.5"><Icon name="park" />{formatHm(Math.round(stayMin))}</span>
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

  // 효율 (Wh/km) 계산 — 0 으로 나누기 방지
  const calcEff = (kwh, dist) => (kwh > 0 && dist > 0) ? (kwh * 1000 / dist) : null;

  return (
    <>
      {monthOrder.map(mk => {
        const m = monthMap.get(mk);
        const expanded = expandedMonths.has(mk);
        return (
          <Fragment key={mk}>
            {/* 월 헤더 — 좌 영역 = monthMode 지도/순위, 우 chevron = 펼치기. 2줄 (요약 + 강화 통계). */}
            <div className="flex items-stretch border-t border-white/[0.10] bg-white/[0.04]">
              <button
                onClick={() => (onMonthClick ? onMonthClick(mk) : toggleMonth(mk))}
                className="flex-1 flex flex-col gap-0.5 px-3 py-2 hover:bg-white/[0.05] active:bg-white/[0.08] transition-colors text-left min-w-0"
                title={onMonthClick ? '이 달 전체 지도/순위 보기' : (expanded ? '접기' : '펼치기')}
              >
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-xs font-bold text-zinc-300 flex-shrink-0 inline-flex items-center gap-1">
                    <span className="text-[9px] px-1 py-px rounded bg-zinc-700/60 text-zinc-300">월</span>
                    {formatMonthLabel(mk)}
                  </span>
                  <span className="text-[10px] text-zinc-600 tabular-nums flex items-center gap-1 truncate">
                    <Icon name="car" className="w-3 h-3" />
                    <span>{m.driveCount}회</span>
                    <span className="text-zinc-700">·</span>
                    <span className="text-blue-400 font-semibold">{m.distance.toFixed(0)}<span className="text-zinc-600 ml-0.5">km</span></span>
                    {m.usedPct > 0 && (
                      <>
                        <span className="text-zinc-700">·</span>
                        <span>{m.usedPct}%</span>
                      </>
                    )}
                  </span>
                </div>
                <StatsLine
                  kwh={m.kwh} durationMin={m.durationMin} distance={m.distance}
                  driveCount={m.driveCount} dayCount={m.days.length}
                  efficiency={calcEff(m.kwh, m.distance)}
                />
              </button>
              <button
                onClick={() => toggleMonth(mk)}
                className="px-3 flex items-center text-zinc-500 border-l border-white/[0.06] hover:bg-white/[0.05] active:bg-white/[0.08] transition-colors"
                title={expanded ? '접기' : '펼치기'}
              >
                <Chevron expanded={expanded} />
              </button>
            </div>
            {expanded && m.weekOrder.map(wk => {
              const w = m.weekMap.get(wk);
              const weekExpanded = expandedWeeks.has(wk);
              const isCurrentWeek = wk === todayWeekKey;
              return (
                <Fragment key={`${mk}|${wk}`}>
                  {/* 주 헤더 — 좌 영역 = weekMode 지도/순위, 우 chevron = 펼치기. 시각 구분 = 왼쪽 blue 액센트 바 + 들여쓰기. */}
                  <div className="flex items-stretch bg-white/[0.02] border-t border-white/[0.05] border-l-2 border-l-blue-500/30">
                    <button
                      onClick={() => (onWeekClick ? onWeekClick(wk) : toggleWeek(wk))}
                      type="button"
                      className="flex-1 flex flex-col gap-0.5 pl-4 pr-3 py-1.5 hover:bg-white/[0.04] active:bg-white/[0.05] transition-colors text-left min-w-0"
                      title={onWeekClick ? '이 주 전체 지도/순위 보기' : (weekExpanded ? '접기' : '펼치기')}
                    >
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className="text-[11px] font-semibold text-zinc-400 flex-shrink-0 tabular-nums inline-flex items-center gap-1">
                          <span className="text-[9px] px-1 py-px rounded bg-blue-500/20 text-blue-300/90 font-normal">주</span>
                          {formatWeekRange(w.days)}
                          {isCurrentWeek && <span className="text-[9px] text-blue-400 ml-1 font-normal align-middle">이번주</span>}
                        </span>
                        <span className="text-[10px] text-zinc-600 tabular-nums flex items-center gap-1 truncate">
                          <Icon name="car" className="w-3 h-3" />
                          <span>{w.driveCount}회</span>
                          <span className="text-zinc-700">·</span>
                          <span className="text-blue-400 font-semibold">{w.distance.toFixed(0)}<span className="text-zinc-600 ml-0.5">km</span></span>
                          {w.usedPct > 0 && (
                            <>
                              <span className="text-zinc-700">·</span>
                              <span>{w.usedPct}%</span>
                            </>
                          )}
                        </span>
                      </div>
                      <StatsLine
                        kwh={w.kwh} durationMin={w.durationMin} distance={w.distance}
                        driveCount={w.driveCount} dayCount={w.days.length}
                        efficiency={calcEff(w.kwh, w.distance)}
                      />
                    </button>
                    <button
                      onClick={() => toggleWeek(wk)}
                      className="px-3 flex items-center text-zinc-500 border-l border-white/[0.06] hover:bg-white/[0.04] active:bg-white/[0.05] transition-colors"
                      title={weekExpanded ? '접기' : '펼치기'}
                    >
                      <Chevron expanded={weekExpanded} size="w-3 h-3" />
                    </button>
                  </div>
                  {weekExpanded && w.days.flatMap((g, idx) => {
                    const nextDay = idx + 1 < w.days.length ? w.days[idx + 1] : null;
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
          </Fragment>
        );
      })}
    </>
  );
}
