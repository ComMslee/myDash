'use client';

import { Fragment, useMemo, useState } from 'react';
import { formatHours } from '@/lib/format';
import { kstDateStr, kstMondayStr, KST_OFFSET_MS } from '@/lib/kst';
import { Icon } from '../../lib/Icons';
import { useIdleDrainDays } from './useIdleDrainDays';
import { dropSharePct, computeSentrySpans, sumSpansMin } from './idle-drain/compute';
import { dropTextClass } from './idle-drain/colors';
import WeekHeader from './idle-drain/WeekHeader';
import DayTimeline from './idle-drain/DayTimeline';

function currentMonthKey() {
  const kst = new Date(Date.now() + KST_OFFSET_MS);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(mk) {
  const [y, m] = mk.split('-');
  const currentYear = new Date().getFullYear();
  const prefix = parseInt(y) !== currentYear ? `${y.slice(2)}년 ` : '';
  return `${prefix}${parseInt(m)}월`;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function formatDateLabel(key) {
  const [y, m, d] = key.split('-');
  const currentYear = new Date().getFullYear();
  const prefix = parseInt(y) !== currentYear ? `${String(y).slice(2)}/` : '';
  const dow = WEEKDAYS[new Date(parseInt(y), parseInt(m) - 1, parseInt(d)).getDay()];
  return `${prefix}${parseInt(m)}/${parseInt(d)} (${dow})`;
}

export default function IdleDrainCard({ records, chargingSessions = [] }) {
  const { grouped, chargingByDay, stats } = useIdleDrainDays(records, chargingSessions);

  if (!stats) {
    return (
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-6 text-center">
        <div className="text-zinc-600 text-sm">대기 중 배터리 소모 데이터가 아직 없습니다</div>
      </div>
    );
  }

  const { avgDrainPerDay, avgIdleHours, totalRecords } = stats;
  const fmtDrop = (n) => (Math.round(n * 10) / 10).toString();

  const { totalClimatePct, totalSentryPct, totalClimateMin, totalSentryMin, dayCompute, weeks } = useMemo(() => {
    let totalIdleH = 0, totalDropRaw = 0, totalClimateMin = 0, totalSentryMin = 0;
    const dayCompute = new Map();
    const weekMap = new Map();
    const weekOrder = [];
    for (const { key, items } of grouped) {
      let dayIdleH = 0, dayDropRaw = 0, dayClimateMin = 0, daySentryMin = 0;
      const sentrySpansList = [];
      for (const r of items) {
        dayIdleH += r.idle_hours;
        dayDropRaw += r.soc_drop;
        dayClimateMin += r.climate_minutes || 0;
        const spans = computeSentrySpans(r.online_spans, r.climate_spans);
        sentrySpansList.push(spans);
        daySentryMin += sumSpansMin(spans);
      }
      totalIdleH += dayIdleH;
      totalDropRaw += dayDropRaw;
      totalClimateMin += dayClimateMin;
      totalSentryMin += daySentryMin;
      const dayDrop = Math.round(dayDropRaw * 10) / 10;
      dayCompute.set(key, {
        items,
        dayIdleH,
        dayDrop,
        dayClimateMin,
        daySentryMin,
        dayClimatePct: dropSharePct(dayClimateMin, dayIdleH, dayDrop),
        daySentryPct: dropSharePct(daySentryMin, dayIdleH, dayDrop),
        sentrySpansList,
      });

      const weekKey = kstMondayStr(key + 'T00:00:00Z');
      let w = weekMap.get(weekKey);
      if (!w) {
        w = { weekKey, dayKeys: [], weekIdleH: 0, weekDropRaw: 0, weekClimateMin: 0, weekSentryMin: 0 };
        weekMap.set(weekKey, w);
        weekOrder.push(weekKey);
      }
      w.dayKeys.push(key);
      w.weekIdleH += dayIdleH;
      w.weekDropRaw += dayDropRaw;
      w.weekClimateMin += dayClimateMin;
      w.weekSentryMin += daySentryMin;
    }

    const todayWeekKey = kstMondayStr(kstDateStr(Date.now()) + 'T00:00:00Z');
    const weeks = weekOrder.map(wk => {
      const w = weekMap.get(wk);
      const avgDrainPerDay = w.dayKeys.length > 0 ? Math.round(w.weekDropRaw / w.dayKeys.length * 10) / 10 : 0;
      const diff = Math.round(
        (new Date(todayWeekKey + 'T00:00:00Z').getTime() - new Date(wk + 'T00:00:00Z').getTime()) / (7 * 86400000)
      );
      const label = diff === 0 ? '이번 주' : diff === 1 ? '지난 주' : `${diff}주 전`;
      const mon = new Date(wk + 'T00:00:00Z');
      const sun = new Date(mon.getTime() + 6 * 86400000);
      const range = `${mon.getUTCMonth() + 1}/${mon.getUTCDate()} ~ ${sun.getUTCMonth() + 1}/${sun.getUTCDate()}`;
      return {
        weekKey: wk,
        dayKeys: w.dayKeys,
        avgIdleH: w.dayKeys.length > 0 ? w.weekIdleH / w.dayKeys.length : 0,
        avgDrainPerDay,
        weekClimatePct: dropSharePct(w.weekClimateMin, w.weekIdleH, avgDrainPerDay),
        weekSentryPct: dropSharePct(w.weekSentryMin, w.weekIdleH, avgDrainPerDay),
        weekClimateMin: w.weekClimateMin,
        weekSentryMin: w.weekSentryMin,
        label,
        range,
      };
    });

    const totalAvgDrainPerDay = totalIdleH > 0 ? Math.round(totalDropRaw / totalIdleH * 24 * 10) / 10 : 0;
    return {
      totalClimatePct: dropSharePct(totalClimateMin, totalIdleH, totalAvgDrainPerDay),
      totalSentryPct: dropSharePct(totalSentryMin, totalIdleH, totalAvgDrainPerDay),
      totalClimateMin,
      totalSentryMin,
      dayCompute,
      weeks,
    };
  }, [grouped]);

  const [expandedWeeks, setExpandedWeeks] = useState(() => new Set());
  const toggleWeek = (wk) => setExpandedWeeks(prev => {
    const next = new Set(prev);
    if (next.has(wk)) next.delete(wk); else next.add(wk);
    return next;
  });

  // 월별 그룹 (주 → 월로 묶기)
  const monthGroups = useMemo(() => {
    const map = new Map();
    const order = [];
    for (const week of weeks) {
      const mk = week.weekKey.slice(0, 7); // YYYY-MM (월요일 기준)
      let m = map.get(mk);
      if (!m) { m = { monthKey: mk, weeks: [], dayCount: 0, totalDrop: 0 }; map.set(mk, m); order.push(mk); }
      m.weeks.push(week);
      m.dayCount += week.dayKeys.length;
      m.totalDrop += week.avgDrainPerDay * week.dayKeys.length;
    }
    return order.map(mk => map.get(mk));
  }, [weeks]);

  const [expandedMonths, setExpandedMonths] = useState(() => new Set([currentMonthKey()]));
  const toggleMonth = (mk) => setExpandedMonths(prev => {
    const next = new Set(prev);
    if (next.has(mk)) next.delete(mk); else next.add(mk);
    return next;
  });

  return (
    <>
      {/* 요약 헤더 */}
      <div className="grid grid-cols-2 border-b border-white/[0.06]">
        <div className="text-center py-2 border-r border-white/[0.06]">
          <div className="text-[10px] text-zinc-600 mb-1">일평균 손실</div>
          <div className="text-sm font-extrabold tabular-nums text-amber-400">
            {avgDrainPerDay}%<span className="text-[9px] font-normal text-zinc-600 ml-0.5">/일</span>
            {totalClimatePct != null && (
              <span className="text-[10px] font-normal text-sky-700 opacity-80 ml-1" title={`공조 작동 ${Math.round(totalClimateMin)}분`}>
                <Icon name="climate" className="w-4 h-4 inline-block align-middle mr-0.5" />{totalClimatePct}%
              </span>
            )}
            {totalSentryPct != null && (
              <span className="text-[10px] font-normal text-fuchsia-400 opacity-80 ml-1" title={`센트리 의심 ${Math.round(totalSentryMin)}분`}>
                <Icon name="shield" className="w-4 h-4 inline-block align-middle mr-0.5" />{totalSentryPct}%
              </span>
            )}
          </div>
        </div>
        <div className="text-center py-2">
          <div className="text-[10px] text-zinc-600 mb-1">평균 대기</div>
          <div className="text-sm font-extrabold tabular-nums text-zinc-300">{formatHours(avgIdleHours)}</div>
          <div className="text-[9px] text-zinc-600 mt-0.5">{totalRecords}회 기준</div>
        </div>
      </div>

      {/* 월별 → 주별 그룹 */}
      {monthGroups.map(mg => {
        const monthExpanded = expandedMonths.has(mg.monthKey);
        const monthAvgDrain = mg.dayCount > 0 ? Math.round(mg.totalDrop / mg.dayCount * 10) / 10 : 0;
        return (
          <Fragment key={mg.monthKey}>
            {/* 월 헤더 */}
            <button
              onClick={() => toggleMonth(mg.monthKey)}
              className="w-full px-4 py-2 border-t border-white/[0.10] bg-white/[0.03] hover:bg-white/[0.06] flex items-center justify-between gap-2 text-left transition-colors"
            >
              <span className="flex items-center gap-2">
                <svg className={`w-3 h-3 text-zinc-500 flex-shrink-0 transition-transform ${monthExpanded ? '' : '-rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                <span className="text-[11px] font-bold text-zinc-200">{formatMonthLabel(mg.monthKey)}</span>
              </span>
              <span className="flex items-center gap-2 tabular-nums flex-shrink-0">
                <span className="text-[10px] text-zinc-600">{mg.dayCount}일</span>
                <span className="text-[10px] font-bold text-amber-400">{monthAvgDrain}%<span className="text-zinc-600 ml-0.5">/일</span></span>
              </span>
            </button>
            {monthExpanded && mg.weeks.map(week => {
              const weekExpanded = expandedWeeks.has(week.weekKey);
              return (
                <Fragment key={week.weekKey}>
                  <WeekHeader week={week} expanded={weekExpanded} onToggle={toggleWeek} fmtDrop={fmtDrop} />
                  {weekExpanded && week.dayKeys.map(key => (
                    <DayTimeline
                      key={key}
                      dayKey={key}
                      dayData={dayCompute.get(key)}
                      chargingSessions={chargingByDay[key]}
                      fmtDrop={fmtDrop}
                      formatDateLabel={formatDateLabel}
                    />
                  ))}
                </Fragment>
              );
            })}
          </Fragment>
        );
      })}
    </>
  );
}
