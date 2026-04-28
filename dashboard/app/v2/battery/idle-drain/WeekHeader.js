'use client';

import { formatHours } from '@/lib/format';
import { dropTextClass } from './colors';

export default function WeekHeader({ week, expanded, onToggle, fmtDrop }) {
  const { weekKey, avgDrainPerDay, avgIdleH, weekClimatePct, weekSentryPct, weekClimateMin, weekSentryMin, label, range } = week;

  return (
    <button
      onClick={() => onToggle(weekKey)}
      className="w-full px-4 py-2 border-t border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] flex items-center justify-between gap-2 text-left transition-colors"
    >
      <span className="flex items-center gap-2 min-w-0">
        <svg className={`w-3 h-3 text-zinc-500 flex-shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        <span className="text-[10px] font-bold text-zinc-300">{label}</span>
        <span className="text-[10px] text-zinc-600 tabular-nums">{range}</span>
      </span>
      <span className="flex items-center gap-2 tabular-nums flex-shrink-0">
        <span className={`text-[10px] font-bold ${dropTextClass(avgDrainPerDay)}`}>
          {avgDrainPerDay < 0.05 ? '0%' : `-${fmtDrop(avgDrainPerDay)}%`}
        </span>
        <span className="text-[10px] text-zinc-600">
          {weekClimatePct != null && (
            <span className="text-sky-700 mr-1 opacity-80" title={`공조 ${Math.round(weekClimateMin)}분`}>
              <span aria-hidden="true">🌀</span>{weekClimatePct}%
            </span>
          )}
          {weekSentryPct != null && (
            <span className="text-fuchsia-400 mr-1 opacity-80" title={`센트리 의심 ${Math.round(weekSentryMin)}분`}>
              <span aria-hidden="true">🛡</span>{weekSentryPct}%
            </span>
          )}
          {formatHours(avgIdleH)}/일
        </span>
      </span>
    </button>
  );
}
