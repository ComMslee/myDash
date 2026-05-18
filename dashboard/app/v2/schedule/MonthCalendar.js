'use client';

import { useMemo, useState } from 'react';
import { KST_OFFSET_MS } from '@/lib/kst';

// 커스텀 월 달력 모달 — [📅 더보기] 클릭 시 노출.
// 각 셀에 실행 아이콘 + 개수만 간략히. 셀 탭 = 타임라인 그 날짜로 이동.

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
const DOW_KEYS   = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function pad(n) { return String(n).padStart(2, '0'); }

function todayStr() {
  const t = new Date(Date.now() + KST_OFFSET_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

function buildMonthCells(year, month) {
  // month 1~12
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startWeekday = firstOfMonth.getUTCDay();
  const startMs = firstOfMonth.getTime() - startWeekday * 86400000;
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(startMs + i * 86400000);
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth() + 1;
    const d = dt.getUTCDate();
    cells.push({
      y, m, d,
      dow: dt.getUTCDay(),
      dateStr: `${y}-${pad(m)}-${pad(d)}`,
      inMonth: m === month,
    });
  }
  return cells;
}

function isPausedOn(dateStr, pausePeriods) {
  return pausePeriods?.some((p) => p.from_date <= dateStr && dateStr <= p.until_date) ?? false;
}

function plannedFor(s, dateStr, isHoliday, dow) {
  if (!s.enabled) return null;
  if (s.mode === 'now') return null;
  if (s.valid_from && dateStr < s.valid_from) return null;
  if (s.valid_until && dateStr > s.valid_until) return null;
  if (Array.isArray(s.skip_dates) && s.skip_dates.includes(dateStr)) return 'skip';
  const t = s.trigger_config || {};
  if (t.time) {
    const days = Array.isArray(t.time.days) ? t.time.days : [];
    if (days.length > 0 && !days.includes(DOW_KEYS[dow])) return null;
    if (t.time.skip_holidays && isHoliday) return null;
    return 'planned';
  }
  if (t.location || t.weather) return 'planned';
  return null;
}

function summarize(cell, today, schedules, executionsByDate, holidayMap) {
  const ymd = cell.dateStr.replace(/-/g, '');
  const isHoliday = holidayMap.has(ymd);
  let planned = 0, skip = 0;
  for (const s of schedules) {
    const r = plannedFor(s, cell.dateStr, isHoliday, cell.dow);
    if (r === 'planned') planned += 1;
    else if (r === 'skip') skip += 1;
  }
  const execs = executionsByDate.get(cell.dateStr) || [];
  let success = 0, failed = 0, dry = 0, other = 0;
  for (const e of execs) {
    if (e.status === 'success') success += 1;
    else if (e.status === 'failed') failed += 1;
    else if (e.status === 'dry_run') dry += 1;
    else other += 1;
  }
  return { planned, skip, success, failed, dry, other, isPast: cell.dateStr < today, isToday: cell.dateStr === today, isHoliday };
}

function badge(sum) {
  // 우선순위 — failed > success > dry > planned
  if (sum.failed > 0) return { icon: '✗', count: sum.failed, cls: 'text-rose-400' };
  if (sum.success > 0) return { icon: '✓', count: sum.success, cls: 'text-emerald-400' };
  if (sum.dry > 0) return { icon: '◎', count: sum.dry, cls: 'text-blue-400' };
  if (sum.planned > 0) return { icon: '⏰', count: sum.planned, cls: 'text-blue-300/70' };
  if (sum.skip > 0) return { icon: '⏸', count: sum.skip, cls: 'text-amber-400/70' };
  return null;
}

export default function MonthCalendar({
  open,
  onClose,
  onPick,
  schedules = [],
  executionsByDate = new Map(),
  holidayMap = new Map(),
  pausePeriods = [],
  initialMonth, // 'YYYY-MM'
}) {
  const today = todayStr();
  const [year, monthState] = (() => {
    const init = initialMonth || today.slice(0, 7);
    const [y, m] = init.split('-').map((x) => parseInt(x, 10));
    return [y, m];
  })();
  const [cur, setCur] = useState({ y: year, m: monthState });

  const cells = useMemo(() => buildMonthCells(cur.y, cur.m), [cur]);

  const prevMonth = () => {
    setCur(({ y, m }) => (m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }));
  };
  const nextMonth = () => {
    setCur(({ y, m }) => (m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 }));
  };
  const jumpThisMonth = () => {
    const [ty, tm] = today.split('-').map((x) => parseInt(x, 10));
    setCur({ y: ty, m: tm });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[85] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="w-full max-w-md bg-[#0f0f0f] border border-white/[0.10] rounded-2xl p-3 space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={prevMonth}
              className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs"
            >‹</button>
            <span className="text-sm font-semibold text-zinc-100 tabular-nums px-2">
              {cur.y}년 {cur.m}월
            </span>
            <button
              onClick={nextMonth}
              className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs"
            >›</button>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={jumpThisMonth}
              className="text-[10px] px-2 py-1 rounded bg-blue-500/15 text-blue-300 hover:bg-blue-500/25"
            >이번달</button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs"
              aria-label="닫기"
            >✕</button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-0.5 text-center">
          {WEEKDAY_KO.map((w, i) => (
            <div
              key={w}
              className={`text-[10px] font-semibold py-1 ${i === 0 ? 'text-rose-400' : i === 6 ? 'text-sky-400' : 'text-zinc-500'}`}
            >{w}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((c) => {
            const sum = summarize(c, today, schedules, executionsByDate, holidayMap);
            const b = badge(sum);
            const ymd = c.dateStr.replace(/-/g, '');
            const holidayName = holidayMap.get(ymd) || null;
            const paused = isPausedOn(c.dateStr, pausePeriods);
            const dowCls = c.dow === 0 || holidayName ? 'text-rose-400' : c.dow === 6 ? 'text-sky-400' : 'text-zinc-300';
            const bg = sum.isToday
              ? 'bg-blue-500/15 ring-1 ring-blue-500/40'
              : paused
                ? 'bg-amber-500/5'
                : c.inMonth
                  ? 'bg-zinc-900/50 hover:bg-zinc-800'
                  : 'bg-transparent hover:bg-zinc-900/30';
            const dimCls = c.inMonth ? '' : 'opacity-30';
            return (
              <button
                key={c.dateStr}
                onClick={() => onPick?.(c.dateStr)}
                title={holidayName ? `${c.dateStr} · ${holidayName}` : c.dateStr}
                className={`aspect-square rounded-md p-1 flex flex-col items-center justify-between transition-colors border ${sum.isToday ? 'border-blue-500/40' : 'border-transparent'} ${bg} ${dimCls}`}
              >
                <span className={`text-[11px] font-semibold tabular-nums ${dowCls}`}>{c.d}</span>
                <div className="min-h-[14px] flex items-center justify-center">
                  {b && (
                    <span className={`text-[10px] font-mono tabular-nums ${b.cls}`}>
                      {b.icon}{b.count > 1 ? b.count : ''}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-3 text-[10px] text-zinc-500 pt-1 border-t border-white/[0.04] flex-wrap">
          <span><span className="text-emerald-400">✓</span> 성공</span>
          <span><span className="text-rose-400">✗</span> 실패</span>
          <span><span className="text-blue-400">◎</span> Dry</span>
          <span><span className="text-blue-300/70">⏰</span> 예정</span>
          <span><span className="text-amber-400/70">⏸</span> 스킵</span>
        </div>
      </div>
    </div>
  );
}
