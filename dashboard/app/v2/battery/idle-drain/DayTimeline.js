'use client';

import { Fragment } from 'react';
import { formatHours } from '@/lib/format';
import { formatHM, toKstDate } from '@/lib/kst';
import { CLIMATE_BG, SENTRY_BG, dropTextClass, dropBarBg } from './colors';
import { dropSharePct, sumSpansMin } from './compute';

export default function DayTimeline({ dayKey, dayData, chargingSessions, fmtDrop, formatDateLabel }) {
  const { items, dayIdleH, dayDrop, dayClimateMin, daySentryMin, dayClimatePct, daySentryPct, sentrySpansList } = dayData;

  return (
    <div className="border-t border-white/[0.04]">
      <div className="px-4 py-1.5 bg-white/[0.02] flex items-center justify-between">
        <span className="text-[10px] font-semibold text-zinc-500 tabular-nums">{formatDateLabel(dayKey)}</span>
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
            const sentrySpans = sentrySpansList[i];
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
                {/* 공조 구간 밴드 */}
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
          {(chargingSessions || []).map((c, ci) => {
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
}
