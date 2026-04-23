'use client';

import { Fragment, useMemo } from 'react';
import { formatHours } from '@/lib/format';
import { toKstDate, formatHM } from '@/lib/kst';
import { useIdleDrainDays } from './useIdleDrainDays';

// 하단 밴드 색 — 공조(sky-400) / 센트리 의심(fuchsia-400, 공조와 겹치지 않음)
const CLIMATE_BG = 'rgba(56,189,248,0.9)';
const SENTRY_BG = 'rgba(232,121,249,0.95)';

// idle 전체 대비 퍼센트 — 1% 미만이면 null
function pctOf(minutes, idleHours) {
  if (!idleHours || idleHours <= 0) return null;
  const pct = Math.round((minutes / (idleHours * 60)) * 100);
  return pct >= 1 ? pct : null;
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

// 대기 손실 5단계 색상 (신호등형 그라데이션)
// < 0.05%: 사실상 0 (에메랄드 밝음)  ·  0-1%: 에메랄드 어두움  ·  1-2%: 앰버  ·  2-3%: 오렌지  ·  3-4%: 레드  ·  4%+: 다크레드
function dropTextClass(drop) {
  if (drop < 0.05) return 'text-emerald-400';
  if (drop < 1) return 'text-emerald-700';
  if (drop < 2) return 'text-amber-500';
  if (drop < 3) return 'text-orange-500';
  if (drop < 4) return 'text-red-500';
  return 'text-red-700';
}

// 24h 타임라인 바 배경 (0.85 알파)
function dropBarBg(drop) {
  if (drop < 1) return 'rgba(4,120,87,0.85)';     // emerald-700
  if (drop < 2) return 'rgba(245,158,11,0.85)';   // amber-500
  if (drop < 3) return 'rgba(249,115,22,0.85)';   // orange-500
  if (drop < 4) return 'rgba(239,68,68,0.85)';    // red-500
  return 'rgba(185,28,28,0.85)';                   // red-700
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

  const { avgDrainPerDay, avgIdleHours, avgDrop, withDrainCount, totalRecords } = stats;
  const fmtDrop = (n) => (Math.round(n * 10) / 10).toString();

  // 전체 총계 + 일자별 파생치 — grouped 변경 시에만 재계산
  const { totalClimatePct, totalSentryPct, totalClimateMin, totalSentryMin, dayCompute } = useMemo(() => {
    let totalIdleH = 0, totalClimateMin = 0, totalSentryMin = 0;
    const dayCompute = new Map();
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
      totalClimateMin += dayClimateMin;
      totalSentryMin += daySentryMin;
      dayCompute.set(key, {
        dayIdleH,
        dayDrop: Math.round(dayDropRaw * 10) / 10,
        dayClimateMin,
        daySentryMin,
        dayClimatePct: pctOf(dayClimateMin, dayIdleH),
        daySentryPct: pctOf(daySentryMin, dayIdleH),
        sentrySpansList,
      });
    }
    return {
      totalClimatePct: pctOf(totalClimateMin, totalIdleH),
      totalSentryPct: pctOf(totalSentryMin, totalIdleH),
      totalClimateMin,
      totalSentryMin,
      dayCompute,
    };
  }, [grouped]);

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
      <div className="grid grid-cols-3 border-b border-white/[0.06]">
        <div className="text-center py-3 border-r border-white/[0.06]">
          <div className="text-[10px] text-zinc-600 mb-1">일평균 손실</div>
          <div className="text-sm font-extrabold tabular-nums text-amber-400">
            {avgDrainPerDay}%
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
          <div className="text-[9px] text-zinc-600 mt-0.5">/일</div>
        </div>
        <div className="text-center py-3 border-r border-white/[0.06]">
          <div className="text-[10px] text-zinc-600 mb-1">평균 대기</div>
          <div className="text-sm font-extrabold tabular-nums text-zinc-300">{formatHours(avgIdleHours)}</div>
          <div className="text-[9px] text-zinc-600 mt-0.5">{totalRecords}회 기준</div>
        </div>
        <div className="text-center py-3">
          <div className="text-[10px] text-zinc-600 mb-1">평균 손실</div>
          <div className={`text-sm font-extrabold tabular-nums ${dropTextClass(avgDrop)}`}>{avgDrop}%</div>
          <div className="text-[9px] text-zinc-600 mt-0.5">드레인 {withDrainCount}회</div>
        </div>
      </div>

      {/* 날짜별 그룹 리스트 */}
      {grouped.map(({ key, items }) => {
        const { dayIdleH, dayDrop, dayClimateMin, daySentryMin, dayClimatePct, daySentryPct, sentrySpansList: daySentrySpansList } = dayCompute.get(key);
        return (
          <div key={key} className="border-t border-white/[0.04]">
            <div className="px-4 py-1.5 bg-white/[0.02] flex items-center justify-between">
              <span className="text-[10px] font-semibold text-zinc-500 tabular-nums">{formatDateLabel(key)}</span>
              <div className="flex items-center gap-2 tabular-nums">
                <span className="text-[10px] text-zinc-600">
                  {formatHours(dayIdleH)}
                  {dayClimatePct != null && (
                    <span
                      className="text-sky-700 ml-1 opacity-80"
                      title={`공조 작동 추정 ${Math.round(dayClimateMin)}분`}
                    >
                      (<span aria-hidden="true">🌀</span>{dayClimatePct}%)
                    </span>
                  )}
                  {daySentryPct != null && (
                    <span
                      className="text-fuchsia-400 ml-1 opacity-80"
                      title={`센트리 의심(공조 제외 온라인) 추정 ${Math.round(daySentryMin)}분`}
                    >
                      (<span aria-hidden="true">🛡</span>{daySentryPct}%)
                    </span>
                  )}
                </span>
                <span className={`text-[10px] font-bold ${dropTextClass(dayDrop)}`}>
                  {dayDrop < 0.05 ? '0%' : `-${fmtDrop(dayDrop)}%`}
                </span>
              </div>
            </div>
            <div className="px-4 py-2.5">
              {/* 24h 타임라인 — 상단 drain(38px) + 하단 공조/센트리 밴드(10px) */}
              <div className="relative w-full h-12 rounded-md overflow-hidden bg-white/[0.05]">
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
                  const itemClimatePct = pctOf(climateMin, r.idle_hours);
                  const itemSentryPct = pctOf(itemSentryMin, r.idle_hours);
                  if (itemClimatePct != null) titleParts.push(`🌀 공조 ${itemClimatePct}%`);
                  if (itemSentryPct != null) titleParts.push(`🛡 센트리 의심 ${itemSentryPct}%`);
                  return (
                    <Fragment key={i}>
                      {/* drain 바 — 상단 38px */}
                      <div
                        className="absolute left-0 flex items-center justify-center text-[10px] font-bold tabular-nums text-white"
                        style={{
                          top: 0,
                          height: '38px',
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
                              height: '10px',
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
                              height: '10px',
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
    </div>
  );
}
