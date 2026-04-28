'use client';

import { Fragment, useMemo, useState } from 'react';
import { formatHours } from '@/lib/format';
import { toKstDate, formatHM, kstDateStr, kstMondayStr, kstDayOfWeek } from '@/lib/kst';
import { useIdleDrainDays } from './useIdleDrainDays';

// 하단 밴드 색 — 공조(sky-400) / 센트리 의심(fuchsia-400, 공조와 겹치지 않음)
// 드레인 바와 겹치므로 알파 0.5로 톤다운
const CLIMATE_BG = 'rgba(56,189,248,0.5)';
const SENTRY_BG = 'rgba(232,121,249,0.5)';

// 드레인 용량 중 공조/센트리가 차지한 추정 기여 % — 시간 점유율 × 드레인%
// (시간 가중 단순 모델: 그 구간이 다른 구간과 동일 속도로 빠진다는 근사)
// 0.05% 미만은 null, 1자리 소수.
function dropSharePct(minutes, idleHours, drop) {
  if (!idleHours || idleHours <= 0) return null;
  if (drop == null || drop <= 0) return null;
  const share = (minutes / (idleHours * 60)) * drop;
  if (share < 0.05) return null;
  return Math.round(share * 10) / 10;
}

// 3분 미만 노이즈 제외 임계(ms)
const SENTRY_MIN_SPAN_MS = 180000;

// onlineSpans에서 climateSpans 겹침을 빼 센트리 의심 구간만 추출
// (3분 미만 잔여 구간은 노이즈로 제외)
function computeSentrySpans(onlineSpans, climateSpans) {
  const out = [];
  for (const on of onlineSpans || []) {
    let pieces = [{ s: on.s, e: on.e }];
    for (const cs of climateSpans || []) {
      const next = [];
      for (const p of pieces) {
        if (cs.e <= p.s || cs.s >= p.e) { next.push(p); continue; }
        if (cs.s <= p.s && cs.e >= p.e) continue;
        if (cs.s > p.s) next.push({ s: p.s, e: Math.min(cs.s, p.e) });
        if (cs.e < p.e) next.push({ s: Math.max(cs.e, p.s), e: p.e });
      }
      pieces = next;
    }
    for (const p of pieces) {
      if (p.e - p.s >= SENTRY_MIN_SPAN_MS) out.push(p);
    }
  }
  return out;
}

function sumSpansMin(spans) {
  return (spans || []).reduce((t, sp) => t + (sp.e - sp.s), 0) / 60000;
}

// 대기 손실 3단계 색상 — 신호등(에메랄드·앰버·레드), 0%는 에메랄드 밝음
function dropTextClass(drop) {
  if (drop < 0.05) return 'text-emerald-400';
  if (drop < 1.5) return 'text-emerald-700';
  if (drop < 3)   return 'text-amber-500';
  return 'text-red-500';
}

// 24h 타임라인 바 배경 (0.85 알파) — 3단계
function dropBarBg(drop) {
  if (drop < 1.5) return 'rgba(4,120,87,0.85)';    // emerald-700
  if (drop < 3)   return 'rgba(245,158,11,0.85)';  // amber-500
  return 'rgba(239,68,68,0.85)';                    // red-500
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

  // 전체 총계 + 일자별 파생치 + 주별 집계 — grouped 변경 시에만 재계산
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

      // 주(월~일) 단위 집계
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
    const weeks = weekOrder.map(wk => {
      const w = weekMap.get(wk);
      // 일자 단위와 동일한 척도로 표시 — 데이터가 있는 날의 평균 일일 소실
      // (기존: weekDrop/weekIdleH*24 = 24h 정규화 비율 → 짧은 idle만 있는 주에서 실제값보다 크게 보이는 버그)
      const avgDrainPerDay = w.dayKeys.length > 0 ? Math.round(w.weekDropRaw / w.dayKeys.length * 10) / 10 : 0;
      return {
        weekKey: wk,
        dayKeys: w.dayKeys,
        avgIdleH: w.dayKeys.length > 0 ? w.weekIdleH / w.dayKeys.length : 0,
        avgDrainPerDay,
        weekClimatePct: dropSharePct(w.weekClimateMin, w.weekIdleH, avgDrainPerDay),
        weekSentryPct: dropSharePct(w.weekSentryMin, w.weekIdleH, avgDrainPerDay),
        weekClimateMin: w.weekClimateMin,
        weekSentryMin: w.weekSentryMin,
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

  // 기본 모두 접힘 — 사용자가 원하는 주만 펼침
  const [expandedWeeks, setExpandedWeeks] = useState(() => new Set());
  const toggleWeek = (wk) => setExpandedWeeks(prev => {
    const next = new Set(prev);
    if (next.has(wk)) next.delete(wk); else next.add(wk);
    return next;
  });

  // 이번 주 기준점 — 상대 라벨 계산용
  const todayWeekKey = useMemo(() => kstMondayStr(kstDateStr(Date.now()) + 'T00:00:00Z'), []);
  const weekLabel = (weekKey) => {
    const diff = Math.round(
      (new Date(todayWeekKey + 'T00:00:00Z').getTime() - new Date(weekKey + 'T00:00:00Z').getTime()) / (7 * 86400000)
    );
    if (diff === 0) return '이번 주';
    if (diff === 1) return '지난 주';
    return `${diff}주 전`;
  };
  const weekRange = (weekKey) => {
    const mon = new Date(weekKey + 'T00:00:00Z');
    const sun = new Date(mon.getTime() + 6 * 86400000);
    return `${mon.getUTCMonth() + 1}/${mon.getUTCDate()} ~ ${sun.getUTCMonth() + 1}/${sun.getUTCDate()}`;
  };

  // 일자 라벨 포맷 (올해면 연도 생략, 요일 표시)
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const formatDateLabel = (key) => {
    const [y, m, d] = key.split('-');
    const currentYear = new Date().getFullYear();
    const prefix = parseInt(y) !== currentYear ? `${String(y).slice(2)}/` : '';
    const dow = WEEKDAYS[new Date(parseInt(y), parseInt(m) - 1, parseInt(d)).getDay()];
    return `${prefix}${parseInt(m)}/${parseInt(d)} (${dow})`;
  };

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

      {/* 주간 그룹 리스트 — 월~일, 이번 주 펼침 + 월/화엔 지난 주도 펼침 */}
      {weeks.map(week => {
        const expanded = expandedWeeks.has(week.weekKey);
        return (
          <Fragment key={week.weekKey}>
            {/* 주 헤더 — 탭하면 펼침/접힘 */}
            <button
              onClick={() => toggleWeek(week.weekKey)}
              className="w-full px-4 py-2 border-t border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] flex items-center justify-between gap-2 text-left transition-colors"
            >
              <span className="flex items-center gap-2 min-w-0">
                <svg className={`w-3 h-3 text-zinc-500 flex-shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                <span className="text-[10px] font-bold text-zinc-300">{weekLabel(week.weekKey)}</span>
                <span className="text-[10px] text-zinc-600 tabular-nums">{weekRange(week.weekKey)}</span>
              </span>
              <span className="flex items-center gap-2 tabular-nums flex-shrink-0">
                <span className={`text-[10px] font-bold ${dropTextClass(week.avgDrainPerDay)}`}>
                  {week.avgDrainPerDay < 0.05 ? '0%' : `-${fmtDrop(week.avgDrainPerDay)}%`}
                </span>
                <span className="text-[10px] text-zinc-600">
                  {week.weekClimatePct != null && (
                    <span className="text-sky-700 mr-1 opacity-80" title={`공조 ${Math.round(week.weekClimateMin)}분`}>
                      <span aria-hidden="true">🌀</span>{week.weekClimatePct}%
                    </span>
                  )}
                  {week.weekSentryPct != null && (
                    <span className="text-fuchsia-400 mr-1 opacity-80" title={`센트리 의심 ${Math.round(week.weekSentryMin)}분`}>
                      <span aria-hidden="true">🛡</span>{week.weekSentryPct}%
                    </span>
                  )}
                  {formatHours(week.avgIdleH)}/일
                </span>
              </span>
            </button>
            {expanded && week.dayKeys.map(key => {
              const { items, dayIdleH, dayDrop, dayClimateMin, daySentryMin, dayClimatePct, daySentryPct, sentrySpansList: daySentrySpansList } = dayCompute.get(key);
        return (
          <div key={key} className="border-t border-white/[0.04]">
            <div className="px-4 py-1.5 bg-white/[0.02] flex items-center justify-between">
              <span className="text-[10px] font-semibold text-zinc-500 tabular-nums">{formatDateLabel(key)}</span>
              <div className="flex items-center gap-2 tabular-nums">
                <span className={`text-[10px] font-bold ${dropTextClass(dayDrop)}`}>
                  {dayDrop < 0.05 ? '0%' : `-${fmtDrop(dayDrop)}%`}
                </span>
                <span className="text-[10px] text-zinc-600">
                  {dayClimatePct != null && (
                    <span
                      className="text-sky-700 mr-1 opacity-80"
                      title={`공조 작동 추정 ${Math.round(dayClimateMin)}분`}
                    >
                      <span aria-hidden="true">🌀</span>{dayClimatePct}%
                    </span>
                  )}
                  {daySentryPct != null && (
                    <span
                      className="text-fuchsia-400 mr-1 opacity-80"
                      title={`센트리 의심(공조 제외 온라인) 추정 ${Math.round(daySentryMin)}분`}
                    >
                      <span aria-hidden="true">🛡</span>{daySentryPct}%
                    </span>
                  )}
                  {formatHours(dayIdleH)}
                </span>
              </div>
            </div>
            <div className="px-4 py-2.5">
              {/* 24h 타임라인 — 상단 drain(28px) + 하단 공조/센트리 밴드(8px) */}
              <div className="relative w-full h-9 rounded-md overflow-hidden bg-white/[0.05]">
                {items.map((r, i) => {
                  const kstStart = toKstDate(r.idle_start);
                  const hourOffset = kstStart.getUTCHours() + kstStart.getUTCMinutes() / 60 + kstStart.getUTCSeconds() / 3600;
                  const leftPct = (hourOffset / 24) * 100;
                  const visibleH = Math.min(24 - hourOffset, r.idle_hours);
                  const widthPct = (visibleH / 24) * 100;
                  if (widthPct <= 0) return null;
                  const isZero = r.soc_drop < 0.05;
                  const isPreCharge = r.next_type === 'charge';
                  const bg = isZero
                    ? (isPreCharge ? 'rgba(234,179,8,0.3)' : 'rgba(16,185,129,0.3)')
                    : (isPreCharge ? 'rgba(234,179,8,0.85)' : dropBarBg(r.soc_drop));
                  const climateMin = r.climate_minutes || 0;
                  const climateSpans = r.climate_spans || [];
                  const sentrySpans = daySentrySpansList[i];
                  const itemSentryMin = sumSpansMin(sentrySpans);
                  const showLabel = widthPct >= 10;
                  const titleParts = [
                    `${formatHM(r.idle_start)}~${r.idle_end ? formatHM(r.idle_end) : '현재'}`,
                    formatHours(r.idle_hours),
                    `${r.soc_start}→${r.soc_end}%`,
                    isZero ? '0%' : `-${fmtDrop(r.soc_drop)}%`,
                  ];
                  if (isPreCharge) titleParts.push('⚡충전 전 대기');
                  const itemClimatePct = dropSharePct(climateMin, r.idle_hours, r.soc_drop);
                  const itemSentryPct = dropSharePct(itemSentryMin, r.idle_hours, r.soc_drop);
                  if (itemClimatePct != null) titleParts.push(`🌀 공조 ${itemClimatePct}%`);
                  if (itemSentryPct != null) titleParts.push(`🛡 센트리 의심 ${itemSentryPct}%`);
                  return (
                    <Fragment key={i}>
                      {/* drain 바 — 상단 28px */}
                      <div
                        className="absolute left-0 flex items-center justify-center text-[10px] font-bold tabular-nums text-white"
                        style={{
                          top: 0,
                          height: '28px',
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          background: bg,
                          textShadow: '0 0 2px rgba(0,0,0,0.6)',
                        }}
                        title={titleParts.join(' · ')}
                      >
                        {showLabel ? (isZero ? '0' : `-${fmtDrop(r.soc_drop)}%`) : ''}
                      </div>
                      {/* 센트리 의심 밴드 — 공조 제외 후 3분 이상 남은 온라인만 (fuchsia) */}
                      {sentrySpans.map((sp, spi) => {
                        const spKst = toKstDate(sp.s);
                        const spHour = spKst.getUTCHours() + spKst.getUTCMinutes() / 60 + spKst.getUTCSeconds() / 3600;
                        const spLeft = (spHour / 24) * 100;
                        const spWidth = ((sp.e - sp.s) / 3600000 / 24) * 100;
                        if (spWidth <= 0) return null;
                        return (
                          <div
                            key={`sn-${i}-${spi}`}
                            className="absolute pointer-events-none"
                            style={{
                              bottom: 0,
                              height: '8px',
                              left: `${spLeft}%`,
                              width: `${spWidth}%`,
                              background: SENTRY_BG,
                            }}
                          />
                        );
                      })}
                      {/* 공조 구간 밴드 — 센트리와 겹치지 않음(별도 구간) */}
                      {climateSpans.map((sp, spi) => {
                        const spKst = toKstDate(sp.s);
                        const spHour = spKst.getUTCHours() + spKst.getUTCMinutes() / 60 + spKst.getUTCSeconds() / 3600;
                        const spLeft = (spHour / 24) * 100;
                        const spWidth = ((sp.e - sp.s) / 3600000 / 24) * 100;
                        if (spWidth <= 0) return null;
                        return (
                          <div
                            key={`clm-${i}-${spi}`}
                            className="absolute pointer-events-none"
                            style={{
                              bottom: 0,
                              height: '8px',
                              left: `${spLeft}%`,
                              width: `${spWidth}%`,
                              background: CLIMATE_BG,
                            }}
                          />
                        );
                      })}
                    </Fragment>
                  );
                })}
                {/* 충전 세션 (노랑) — 전체 높이 */}
                {(chargingByDay[key] || []).map((c, ci) => {
                  const kstStart = toKstDate(c.start);
                  const hourOffset = kstStart.getUTCHours() + kstStart.getUTCMinutes() / 60 + kstStart.getUTCSeconds() / 3600;
                  const leftPct = (hourOffset / 24) * 100;
                  const visibleH = Math.min(24 - hourOffset, c.hours);
                  const widthPct = (visibleH / 24) * 100;
                  if (widthPct <= 0) return null;
                  return (
                    <div
                      key={`c-${ci}`}
                      className="absolute top-0 bottom-0 flex items-center justify-center"
                      style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: 'rgba(234,179,8,0.9)' }}
                      title={`충전 ${formatHM(c.start)}~${formatHM(c.end)} · ${formatHours(c.hours)} · ${c.soc_start}→${c.soc_end}% (+${c.soc_added}%)`}
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="#18181b" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                      </svg>
                    </div>
                  );
                })}
                {/* 6·12·18시 가이드라인 */}
                {[6, 12, 18].map(h => (
                  <div key={h} className="absolute top-0 bottom-0 w-px bg-white/10 pointer-events-none" style={{ left: `${(h / 24) * 100}%` }} />
                ))}
              </div>
            </div>
          </div>
        );
      })}
          </Fragment>
        );
      })}
    </div>
  );
}
