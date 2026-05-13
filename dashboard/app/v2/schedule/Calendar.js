'use client';

import { useState, useMemo } from 'react';

// ─── 상수 ────────────────────────────────────────────────────────────────────

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

const ACTION_LABELS = {
  sentry_on:        '🛡 센트리 ON',
  sentry_off:       '🛡 센트리 OFF',
  climate_on:       '❄️ 공조 ON',
  climate_off:      '❄️ 공조 OFF',
  lock:             '🔒 잠금',
  unlock:           '🔓 잠금해제',
  charge_start:     '⚡ 충전',
  charge_stop:      '⚡ 충전 중지',
  set_charge_limit: '⚡ 한도 변경',
  flash_lights:     '🚨 라이트 점멸',
};

function actionLabel(action) {
  return ACTION_LABELS[action] ?? action;
}

// ─── 날짜 유틸 ───────────────────────────────────────────────────────────────

/** Date → KST 'YYYY-MM-DD' */
function kstDateStr(date) {
  const kst = new Date(date.getTime() + 9 * 3600000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 'YYYY-MM' → { year, month(0-based) } */
function parseMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return { year: y, month: m - 1 };
}

/** 'YYYY-MM' 에서 달력 셀 배열 생성 (최대 42칸, null=빈 셀) */
function buildGridDays(monthStr) {
  const { year, month } = parseMonth(monthStr);
  const firstDay = new Date(Date.UTC(year, month, 1));
  const startDow = firstDay.getUTCDay(); // 0=일
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(Date.UTC(year, month, d));
    cells.push({ day: d, dateStr: kstDateStr(dateObj), dow: dateObj.getUTCDay() });
  }
  // 6행 채우기
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** 이전/다음 달 */
function shiftMonth(monthStr, delta) {
  const { year, month } = parseMonth(monthStr);
  const d = new Date(Date.UTC(year, month + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** KST 오늘 */
function todayStr() {
  return kstDateStr(new Date());
}

/** 'HH:MM' 포맷 */
function fmtTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const kst = new Date(d.getTime() + 9 * 3600000);
  return `${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;
}

// ─── 스케줄 표시 로직 ─────────────────────────────────────────────────────────

/**
 * 스케줄이 dateStr(KST 'YYYY-MM-DD') 에 예약돼 있는지 판별.
 * 반환: null(표시 안 함) | { time: 'HH:MM'|null, type: 'confirmed'|'conditional'|'event', label }
 */
function resolveScheduleForDate(schedule, dateStr, pausePeriods) {
  const { trigger_config, skip_dates = [], enabled } = schedule;
  if (!enabled) return null;
  if (!trigger_config) return null;

  const tc = trigger_config;

  // mode == 'now' → 표시 안 함
  if (tc.mode === 'now') return null;

  // valid_from / valid_until 범위 밖
  if (tc.valid_from && dateStr < tc.valid_from) return null;
  if (tc.valid_until && dateStr > tc.valid_until) return null;

  // skip_dates 에 포함 → skip 표시
  if (skip_dates.includes(dateStr)) return { type: 'skip', time: tc.time ?? null };

  // 휴무 모드 적용 + pausePeriods 포함 일자
  if (schedule.apply_pause_mode && pausePeriods?.length) {
    const inPause = pausePeriods.some(p => dateStr >= p.from_date && dateStr <= p.until_date);
    if (inPause) return { type: 'paused', time: tc.time ?? null };
  }

  // days 체크 (요일 필터)
  if (tc.days) {
    const dow = new Date(dateStr + 'T00:00:00+09:00').getDay();
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    if (!tc.days.includes(dayNames[dow])) return null;
  }

  // location 이벤트 (enter/exit)
  if (tc.location) {
    return { type: 'event', time: null, label: tc.location.event === 'enter' ? '진입' : tc.location.event === 'exit' ? '이탈' : '이벤트' };
  }

  if (!tc.time) return null;

  // 조건부(날씨 등)
  if (tc.weather || tc.condition) {
    return { type: 'conditional', time: tc.time };
  }

  return { type: 'confirmed', time: tc.time };
}

// ─── 칩 스타일 ───────────────────────────────────────────────────────────────

function chipClass(type, isPast) {
  if (type === 'skip' || type === 'paused') {
    return 'bg-zinc-700/30 text-zinc-500';
  }
  if (type === 'event') {
    return 'bg-violet-500/15 text-violet-400';
  }
  if (isPast) {
    return 'bg-emerald-500/15 text-emerald-400';
  }
  if (type === 'conditional') {
    return 'bg-blue-500/8 text-blue-300/70 border border-dashed border-blue-400/30';
  }
  return 'bg-blue-500/15 text-blue-400';
}

// ─── 셀당 칩 목록 계산 ────────────────────────────────────────────────────────

function buildCellChips(dateStr, schedules, pausePeriods, executionsByDate, today) {
  const chips = [];
  const isPast = dateStr < today;
  const isToday = dateStr === today;

  // 과거/오늘: 실행 이력 우선
  if (isPast || isToday) {
    const execs = executionsByDate?.get?.(dateStr) ?? [];
    for (const ex of execs) {
      chips.push({
        key: `exec-${ex.schedule_id}-${ex.triggered_at}`,
        label: actionLabel(ex.action),
        time: fmtTime(ex.triggered_at),
        type: ex.status === 'success' ? 'success' : ex.status === 'skip' ? 'skip' : 'fail',
        isPast: true,
      });
    }
  }

  // 미래/오늘: 예약 스케줄 표시
  if (!isPast || isToday) {
    for (const sch of schedules) {
      const resolved = resolveScheduleForDate(sch, dateStr, pausePeriods);
      if (!resolved) continue;
      chips.push({
        key: `sch-${sch.id}`,
        label: actionLabel(sch.action),
        time: resolved.time ?? '',
        type: resolved.type,
        isPast: false,
        eventLabel: resolved.label,
      });
    }
  }

  // 시간 기준 정렬
  chips.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  return chips;
}

// ─── 실행 이력 칩 스타일 ─────────────────────────────────────────────────────

function execChipClass(status) {
  if (status === 'success') return 'bg-emerald-500/15 text-emerald-400';
  if (status === 'skip') return 'bg-zinc-700/30 text-zinc-500';
  return 'bg-rose-500/15 text-rose-400';
}

// ─── DaySheet 모달 ────────────────────────────────────────────────────────────

function DaySheet({ dateStr, schedules, holidays, pausePeriods, executionsByDate, onClose }) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  const dow = dateObj.getUTCDay();
  const holidayName = holidays?.get?.(dateStr);
  const today = todayStr();
  const isPast = dateStr < today;
  const isToday = dateStr === today;

  const dowClass = dow === 0 ? 'text-rose-400' : dow === 6 ? 'text-sky-400' : 'text-zinc-200';

  // 예약된 작업 (미래/오늘)
  const planned = [];
  if (!isPast || isToday) {
    for (const sch of schedules) {
      const resolved = resolveScheduleForDate(sch, dateStr, pausePeriods);
      if (!resolved) continue;
      planned.push({ sch, resolved });
    }
    planned.sort((a, b) => (a.resolved.time || '99:99').localeCompare(b.resolved.time || '99:99'));
  }

  // 실행 이력 (과거/오늘)
  const execs = (executionsByDate?.get?.(dateStr) ?? []).slice().sort((a, b) =>
    (a.triggered_at || '').localeCompare(b.triggered_at || '')
  );

  const totalCost = execs.reduce((s, e) => s + (e.cost_estimate ?? 0), 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      {/* 배경 오버레이 */}
      <div className="absolute inset-0 bg-black/60" />

      <div
        className="relative w-full max-w-2xl rounded-t-2xl pb-safe"
        style={{ background: '#161618' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 핸들 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-zinc-600" />
        </div>

        {/* 헤더 */}
        <div className="px-4 pt-2 pb-3 border-b border-zinc-800">
          <div className="flex items-baseline gap-2">
            <span className={`text-xl font-bold ${dowClass}`}>
              {m}월 {d}일 ({WEEKDAY_KO[dow]})
            </span>
            {holidayName && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400">
                {holidayName}
              </span>
            )}
          </div>
        </div>

        <div className="px-4 py-3 space-y-4 max-h-[60vh] overflow-y-auto">

          {/* 예약된 작업 */}
          {planned.length > 0 && (
            <section>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wide mb-2">예약된 작업</p>
              <div className="space-y-1.5">
                {planned.map(({ sch, resolved }) => (
                  <div key={sch.id} className="flex items-center justify-between rounded-lg px-3 py-2"
                    style={{ background: '#1e1e20' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-zinc-200">{actionLabel(sch.action)}</span>
                      {resolved.type === 'event' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400">이벤트</span>
                      )}
                      {resolved.type === 'conditional' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300/70 border border-dashed border-blue-400/30">조건부</span>
                      )}
                      {(resolved.type === 'skip' || resolved.type === 'paused') && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/40 text-zinc-500">건너뜀</span>
                      )}
                    </div>
                    <span className="text-sm text-zinc-400 tabular-nums">
                      {resolved.time || (resolved.eventLabel ?? '—')}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-zinc-600 mt-1.5">
                예상 명령 {planned.filter(p => p.resolved.type !== 'skip' && p.resolved.type !== 'paused').length}건
              </p>
            </section>
          )}

          {/* 실행 이력 */}
          {execs.length > 0 && (
            <section>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wide mb-2">실행 이력</p>
              <div className="space-y-1.5">
                {execs.map((ex, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2"
                    style={{ background: '#1e1e20' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-zinc-200">{actionLabel(ex.action)}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${execChipClass(ex.status)}`}>
                        {ex.status === 'success' ? '성공' : ex.status === 'skip' ? '건너뜀' : '실패'}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-zinc-400 tabular-nums">{fmtTime(ex.triggered_at)}</p>
                      {ex.cost_estimate != null && (
                        <p className="text-[10px] text-zinc-600">₩{ex.cost_estimate.toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-[11px] text-zinc-600">
                  실제 명령 {execs.filter(e => e.status === 'success').length}건 / 총 {execs.length}건
                </p>
                {totalCost > 0 && (
                  <p className="text-[11px] text-zinc-500">총 비용 ₩{totalCost.toLocaleString()}</p>
                )}
              </div>
            </section>
          )}

          {/* 비어있음 */}
          {planned.length === 0 && execs.length === 0 && (
            <p className="text-sm text-zinc-600 py-4 text-center">이 날 예약/이력 없음</p>
          )}
        </div>

        {/* 닫기 */}
        <div className="px-4 py-3 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-zinc-300 bg-zinc-800 active:bg-zinc-700 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CalendarCell ─────────────────────────────────────────────────────────────

function CalendarCell({ cell, schedules, holidays, pausePeriods, executionsByDate, today, onSelect }) {
  if (!cell) {
    return <div className="min-h-[56px] rounded-md" style={{ background: '#0f0f0f' }} />;
  }

  const { day, dateStr, dow } = cell;
  const holidayName = holidays?.get?.(dateStr);
  const isToday = dateStr === today;
  const isPast = dateStr < today;

  // 요일 색
  let dowTextClass = 'text-zinc-200';
  if (dow === 0 || holidayName) dowTextClass = 'text-rose-400';
  else if (dow === 6) dowTextClass = 'text-sky-400';

  // 셀 칩
  const chips = buildCellChips(dateStr, schedules, pausePeriods, executionsByDate, today);
  const visibleChips = chips.slice(0, 3);
  const extraCount = chips.length - visibleChips.length;

  // 오늘 강조
  const cellBorder = isToday ? 'ring-1 ring-blue-500/60' : '';

  // 휴무 모드 포함 여부 (셀 전체 dim)
  const hasPause = schedules.some(sch => {
    if (!sch.apply_pause_mode || !pausePeriods?.length) return false;
    return pausePeriods.some(p => dateStr >= p.from_date && dateStr <= p.until_date);
  });

  const dimStyle = hasPause
    ? { backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(255,255,255,0.015) 3px, rgba(255,255,255,0.015) 6px)' }
    : {};

  return (
    <button
      onClick={() => onSelect(dateStr)}
      className={`min-h-[56px] rounded-md px-1.5 py-1 flex flex-col gap-0.5 text-left w-full transition-colors active:opacity-70 ${cellBorder}`}
      style={{ background: '#161618', ...dimStyle }}
    >
      {/* 일자 */}
      <span className={`text-[11px] font-semibold leading-none ${dowTextClass}`}>{day}</span>

      {/* 칩들 */}
      {visibleChips.map(chip => {
        const isPastChip = chip.isPast || isPast;
        let cls = chipClass(chip.type, isPastChip);
        // 실행 이력 칩은 status 기반
        if (chip.type === 'success') cls = 'bg-emerald-500/15 text-emerald-400';
        if (chip.type === 'fail') cls = 'bg-rose-500/15 text-rose-400';

        return (
          <span
            key={chip.key}
            className={`text-[10px] leading-tight px-1 rounded truncate max-w-full ${cls}`}
          >
            {chip.time ? `${chip.time} ` : ''}{chip.eventLabel ?? chip.label}
          </span>
        );
      })}

      {extraCount > 0 && (
        <span className="text-[9px] text-zinc-500 leading-tight pl-0.5">+{extraCount}</span>
      )}
    </button>
  );
}

// ─── 메인 Calendar ────────────────────────────────────────────────────────────

export default function Calendar({
  schedules = [],
  holidays,
  pausePeriods = [],
  executionsByDate,
  onToggleSkipDate,
  month,
  onChangeMonth,
}) {
  const [selectedDate, setSelectedDate] = useState(null);

  const today = todayStr();
  const { year, month: monthIdx } = parseMonth(month);
  const cells = useMemo(() => buildGridDays(month), [month]);

  function handlePrev() { onChangeMonth?.(shiftMonth(month, -1)); }
  function handleNext() { onChangeMonth?.(shiftMonth(month, 1)); }
  function handleSelectDate(dateStr) { setSelectedDate(dateStr); }
  function handleCloseSheet() { setSelectedDate(null); }

  return (
    <div className="space-y-2">
      {/* 월 네비 헤더 */}
      <header className="flex items-center justify-between px-1 py-1">
        <button
          onClick={handlePrev}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          aria-label="이전 달"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <span className="text-sm font-semibold text-zinc-200">
          {year}년 {monthIdx + 1}월
        </span>

        <button
          onClick={handleNext}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          aria-label="다음 달"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </header>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAY_KO.map((w, i) => (
          <div
            key={w}
            className={`text-center text-[11px] font-medium py-1 ${i === 0 ? 'text-rose-400' : i === 6 ? 'text-sky-400' : 'text-zinc-500'}`}
          >
            {w}
          </div>
        ))}

        {/* 날짜 셀 */}
        {cells.map((cell, idx) => (
          <CalendarCell
            key={cell ? cell.dateStr : `empty-${idx}`}
            cell={cell}
            schedules={schedules}
            holidays={holidays}
            pausePeriods={pausePeriods}
            executionsByDate={executionsByDate}
            today={today}
            onSelect={handleSelectDate}
          />
        ))}
      </div>

      {/* 일자 상세 sheet */}
      {selectedDate && (
        <DaySheet
          dateStr={selectedDate}
          schedules={schedules}
          holidays={holidays}
          pausePeriods={pausePeriods}
          executionsByDate={executionsByDate}
          onClose={handleCloseSheet}
        />
      )}
    </div>
  );
}
