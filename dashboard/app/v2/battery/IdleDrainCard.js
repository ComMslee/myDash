'use client';

import { Fragment, useMemo, useState } from 'react';
import { formatHours } from '@/lib/format';
import { kstDateStr, kstMondayStr } from '@/lib/kst';
import { useIdleDrainDays } from './useIdleDrainDays';
import { dropSharePct, computeSentrySpans, sumSpansMin } from './idle-drain/compute';
import { dropTextClass } from './idle-drain/colors';
import WeekHeader from './idle-drain/WeekHeader';
import DayTimeline from './idle-drain/DayTimeline';

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

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      {/* 요약 */}
      <div className="grid grid-cols-2 border-b border-white/[0.06]">
        <div className="text-center py-3 border-r border-white/[0.06]">
          <div className="text-[10px] text-zinc-600 mb-1">일평균 손실</div>
          <div className="text-sm font-extrabold tabular-nums text-amber-400">
            {avgDrainPerDay}%<span className="text-[9px] font-normal text-zinc-600 ml-0.5">/일</span>
            {totalClimatePct != null && (
              <span className="text-[10px] font-normal text-sky-700 opacity-80 ml-1" title={`공조 작동 ${Math.round(totalClimateMin)}분`}>
                <span aria-hidden="true">🌀</span>{totalClimatePct}%
              </span>
            )}
            {totalSentryPct != null && (
              <span className="text-[10px] font-normal text-fuchsia-400 opacity-80 ml-1" title={`센트리 의심 ${Math.round(totalSentryMin)}분`}>
                <span aria-hidden="true">🛡</span>{totalSentryPct}%
              </span>
            )}
          </div>
        </div>
        <div className="text-center py-3">
          <div className="text-[10px] text-zinc-600 mb-1">평균 대기</div>
          <div className="text-sm font-extrabold tabular-nums text-zinc-300">{formatHours(avgIdleHours)}</div>
          <div className="text-[9px] text-zinc-600 mt-0.5">{totalRecords}회 기준</div>
        </div>
      </div>

      {/* 주간 그룹 리스트 */}
      {weeks.map(week => {
        const expanded = expandedWeeks.has(week.weekKey);
        return (
          <Fragment key={week.weekKey}>
            <WeekHeader week={week} expanded={expanded} onToggle={toggleWeek} fmtDrop={fmtDrop} />
            {expanded && week.dayKeys.map(key => (
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
    </div>
  );
}
