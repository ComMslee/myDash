'use client';

import { useMemo, useState } from 'react';

// 캘린더 중심 통합 뷰 — 일자별 예약(미래) + 실행 이력(과거) + 일자 sheet (편집/skip/추가)
// props:
//   schedules, executionsByDate (Map<YYYY-MM-DD, exec[]>), holidayMap (Map),
//   pausePeriods, month, onChangeMonth,
//   onAddSchedule(dateStr), onEditSchedule(s), onDeleteSchedule(s), onToggleEnabled(s), onRunNow(s)

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
const DOW_KEYS   = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const ACTION_LABEL = {
  sentry_on: '🛡 센트리 ON', sentry_off: '🛡 센트리 OFF',
  climate_on: '❄️ 공조 ON', climate_off: '❄️ 공조 OFF',
  lock: '🔒 잠금', unlock: '🔓 해제',
  charge_start: '⚡ 충전', charge_stop: '⚡ 중지',
  set_charge_limit: '⚡ 한도',
  flash_lights: '🚨 라이트',
};

function kstDateStr(d) {
  const t = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

function todayStr() { return kstDateStr(new Date()); }

function parseMonth(month) {
  const [y, m] = month.split('-').map((s) => parseInt(s, 10));
  return { y, m };
}

function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
function firstDow(y, m) { return new Date(y, m - 1, 1).getDay(); }

function isPausedOn(dateStr, pausePeriods) {
  if (!pausePeriods) return false;
  return pausePeriods.some((p) => p.from_date <= dateStr && dateStr <= p.until_date);
}

// 한 스케줄이 특정 날에 발생할지 + 어떤 상태인지
// 반환: null | { time?: 'HH:MM' | '~예측', certainty: 'confirmed' | 'conditional' | 'event' | 'skip', label }
function resolveScheduleForDate(s, dateStr, isHoliday, dow) {
  if (!s.enabled) return null;
  if (s.mode === 'now') return null;
  if (s.valid_from && dateStr < s.valid_from) return null;
  if (s.valid_until && dateStr > s.valid_until) return null;
  if (Array.isArray(s.skip_dates) && s.skip_dates.includes(dateStr)) {
    return { certainty: 'skip', label: ACTION_LABEL[s.action] || s.action };
  }
  const t = s.trigger_config || {};
  let time = null;
  let certainty = null;

  if (t.time) {
    const days = Array.isArray(t.time.days) ? t.time.days : [];
    if (days.length > 0 && !days.includes(DOW_KEYS[dow])) return null;
    if (t.time.skip_holidays && isHoliday) return null;
    time = t.time.hhmm || null;
    certainty = 'confirmed';
  }
  if (t.location) {
    if (t.location.event === 'enter' || t.location.event === 'exit') {
      time = '~이벤트';
      certainty = 'event';
    } else if (!t.time) {
      // location 'at' 만 — 시간 미지정
      time = '머무는 중';
      certainty = 'event';
    }
  }
  if (t.weather && (certainty === 'confirmed' || certainty === null)) {
    certainty = 'conditional';
    if (!time) time = '조건부';
  }
  if (!certainty) return null;
  return { time, certainty, label: ACTION_LABEL[s.action] || s.action };
}

const CHIP_CLS = {
  confirmed:   'bg-blue-500/15 text-blue-300',
  conditional: 'bg-blue-500/10 text-blue-300/70 border border-dashed border-blue-500/30',
  event:       'bg-violet-500/15 text-violet-300',
  skip:        'bg-zinc-700/40 text-zinc-500 line-through',
  success:     'bg-emerald-500/20 text-emerald-300',
  failed:      'bg-rose-500/20 text-rose-300',
  skipped:     'bg-zinc-700/30 text-zinc-500',
  dry_run:     'bg-blue-500/15 text-blue-300',
};

export default function Calendar({
  schedules = [],
  executionsByDate = new Map(),
  holidayMap = new Map(),
  pausePeriods = [],
  month,
  onChangeMonth,
  onAddSchedule,
  onEditSchedule,
  onDeleteSchedule,
  onToggleEnabled,
  onRunNow,
  refreshSignal,
}) {
  const { y, m } = parseMonth(month);
  const totalDays = daysInMonth(y, m);
  const firstWday = firstDow(y, m);
  const today = todayStr();
  const [selected, setSelected] = useState(null);

  const cells = useMemo(() => {
    const arr = [];
    for (let i = 0; i < firstWday; i++) arr.push({ blank: true, key: `b${i}` });
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeek = (firstWday + d - 1) % 7;
      const ymd = dateStr.replace(/-/g, '');
      const holidayName = holidayMap.get(ymd) || null;
      const isHoliday = !!holidayName;
      const paused = isPausedOn(dateStr, pausePeriods);
      const isPast = dateStr < today;
      const isToday = dateStr === today;

      const planned = [];
      for (const s of schedules) {
        const r = resolveScheduleForDate(s, dateStr, isHoliday, dayOfWeek);
        if (r) planned.push({ s, ...r });
      }
      planned.sort((a, b) => (a.time || '').localeCompare(b.time || ''));

      const execs = executionsByDate.get(dateStr) || [];
      arr.push({
        blank: false, key: dateStr,
        d, dateStr, dayOfWeek,
        holidayName, isHoliday, paused, isPast, isToday,
        planned, execs,
      });
    }
    return arr;
  }, [y, m, totalDays, firstWday, schedules, executionsByDate, holidayMap, pausePeriods, today, refreshSignal]);

  const selectedCell = selected ? cells.find((c) => !c.blank && c.dateStr === selected) : null;

  const goPrev = () => {
    let ny = y, nm = m - 1;
    if (nm < 1) { nm = 12; ny--; }
    onChangeMonth(`${ny}-${String(nm).padStart(2, '0')}`);
  };
  const goNext = () => {
    let ny = y, nm = m + 1;
    if (nm > 12) { nm = 1; ny++; }
    onChangeMonth(`${ny}-${String(nm).padStart(2, '0')}`);
  };

  return (
    <div className="space-y-2">
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <button onClick={goPrev} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.04] text-zinc-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h2 className="text-sm font-bold text-zinc-200 tabular-nums">{y}년 {m}월</h2>
          <button onClick={goNext} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.04] text-zinc-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-0.5 text-[10px] text-zinc-500 font-semibold text-center">
          {WEEKDAY_KO.map((w, i) => (
            <div key={w} className={i === 0 ? 'text-rose-400/70' : i === 6 ? 'text-sky-400/70' : ''}>{w}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((c) => {
            if (c.blank) return <div key={c.key} className="aspect-[3/4] min-h-[64px]" />;
            const dowCls = c.dayOfWeek === 0 || c.isHoliday ? 'text-rose-400' : c.dayOfWeek === 6 ? 'text-sky-400' : 'text-zinc-300';
            const bg = c.paused ? 'bg-amber-500/5' : c.isToday ? 'bg-blue-500/10 ring-1 ring-blue-500/30' : 'bg-zinc-900/40 hover:bg-zinc-900/80';
            const dim = c.paused;
            return (
              <button
                key={c.key}
                onClick={() => setSelected(c.dateStr)}
                className={`relative aspect-[3/4] min-h-[64px] rounded-md p-1 text-left transition-colors ${bg} ${dim ? 'opacity-60' : ''}`}
                title={c.holidayName ? `${c.dateStr} · ${c.holidayName}` : c.dateStr}
              >
                <div className="flex items-baseline gap-0.5">
                  <span className={`text-[11px] font-bold tabular-nums ${dowCls}`}>{c.d}</span>
                  {c.holidayName && <span className="text-[8px] text-rose-400/80 truncate flex-1">·{c.holidayName.slice(0, 4)}</span>}
                </div>
                <div className="mt-0.5 flex flex-col gap-0.5">
                  {(c.isPast ? c.execs.slice(0, 2) : c.planned.slice(0, 2)).map((item, i) => {
                    if (c.isPast) {
                      const cls = CHIP_CLS[item.status] || CHIP_CLS.skipped;
                      const label = ACTION_LABEL[item.action] || item.action;
                      return (
                        <span key={`e${i}`} className={`text-[8px] px-1 py-0.5 rounded truncate ${cls}`} title={`${item.status} ${item.reason || ''}`}>
                          {label}
                        </span>
                      );
                    }
                    const cls = CHIP_CLS[item.certainty] || CHIP_CLS.confirmed;
                    return (
                      <span key={`p${i}`} className={`text-[8px] px-1 py-0.5 rounded truncate ${cls}`}>
                        {item.time ? `${item.time} ` : ''}{item.label}
                      </span>
                    );
                  })}
                  {(c.isPast ? c.execs.length : c.planned.length) > 2 && (
                    <span className="text-[8px] text-zinc-500 text-right">+{(c.isPast ? c.execs.length : c.planned.length) - 2}</span>
                  )}
                </div>
                {c.paused && (
                  <span className="absolute top-0.5 right-0.5 text-[8px] text-amber-400">✈️</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-3 text-[9px] text-zinc-600 pt-1 border-t border-white/[0.04]">
          <span><span className="inline-block w-2 h-2 rounded-sm bg-blue-500/40 mr-1" />확정</span>
          <span><span className="inline-block w-2 h-2 rounded-sm bg-blue-500/15 border border-dashed border-blue-500/30 mr-1" />조건부</span>
          <span><span className="inline-block w-2 h-2 rounded-sm bg-violet-500/40 mr-1" />이벤트</span>
          <span><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500/40 mr-1" />성공</span>
          <span><span className="inline-block w-2 h-2 rounded-sm bg-rose-500/40 mr-1" />실패</span>
        </div>
      </div>

      {selectedCell && (
        <DaySheet
          cell={selectedCell}
          schedules={schedules}
          onClose={() => setSelected(null)}
          onAddSchedule={() => { setSelected(null); onAddSchedule?.(selectedCell.dateStr); }}
          onEditSchedule={(s) => { setSelected(null); onEditSchedule?.(s); }}
          onDeleteSchedule={(s) => onDeleteSchedule?.(s)}
          onToggleEnabled={onToggleEnabled}
          onRunNow={onRunNow}
        />
      )}
    </div>
  );
}

function DaySheet({ cell, schedules, onClose, onAddSchedule, onEditSchedule, onDeleteSchedule, onToggleEnabled, onRunNow }) {
  const dow = WEEKDAY_KO[cell.dayOfWeek];
  const isPast = cell.isPast;
  const isToday = cell.isToday;
  const plannedCost = cell.planned.length * 0.022;
  const actualCost = cell.execs.reduce((s, e) => s + (Number(e.cost_estimate) || 0), 0);

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto bg-[#0f0f0f] border-t border-white/[0.10] rounded-t-2xl p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-zinc-100 tabular-nums">
              {cell.dateStr} <span className="text-zinc-500 text-sm font-normal">({dow})</span>
            </h3>
            {cell.holidayName && <p className="text-[11px] text-rose-400 mt-0.5">{cell.holidayName}</p>}
            {cell.paused && <p className="text-[11px] text-amber-400 mt-0.5">✈️ 휴무 모드 적용</p>}
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center">✕</button>
        </div>

        {/* 예약된 작업 — 미래/오늘 */}
        {(!isPast || isToday) && cell.planned.length > 0 && (
          <section>
            <p className="text-xs text-zinc-500 font-semibold tracking-wide mb-1.5">
              📋 예약된 작업 ({cell.planned.length}건 · 예상 ${plannedCost.toFixed(3)})
            </p>
            <div className="space-y-1.5">
              {cell.planned.map(({ s, time, certainty, label }) => {
                const cls = CHIP_CLS[certainty];
                return (
                  <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-zinc-900 border border-white/[0.04]">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${cls} font-mono tabular-nums flex-shrink-0`}>{time || '—'}</span>
                    <span className="text-xs text-zinc-200 truncate flex-1">{s.name} <span className="text-zinc-500">· {label}</span></span>
                    <button onClick={() => onRunNow?.(s)} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">▶</button>
                    <button onClick={() => onEditSchedule?.(s)} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">편집</button>
                    <button onClick={() => onToggleEnabled?.(s)} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">{s.enabled ? '끄기' : '켜기'}</button>
                    <button onClick={() => onDeleteSchedule?.(s)} className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400">✕</button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 실행 이력 — 과거/오늘 */}
        {(isPast || isToday) && (
          <section>
            <p className="text-xs text-zinc-500 font-semibold tracking-wide mb-1.5">
              📜 실행 이력 ({cell.execs.length}건 · 실제 ${actualCost.toFixed(3)})
            </p>
            {cell.execs.length === 0 ? (
              <p className="text-[11px] text-zinc-600 text-center py-3">이 날 실행 이력 없음</p>
            ) : (
              <div className="space-y-1">
                {cell.execs.map((e) => {
                  const cls = CHIP_CLS[e.status] || CHIP_CLS.skipped;
                  const t = new Date(e.triggered_at);
                  const tStr = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
                  return (
                    <div key={e.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-zinc-900 border border-white/[0.04] text-[11px]">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${cls} flex-shrink-0`}>{e.status}</span>
                      <span className="text-zinc-500 tabular-nums w-10 flex-shrink-0">{tStr}</span>
                      <span className="text-zinc-300 truncate flex-1">{ACTION_LABEL[e.action] || e.action}</span>
                      {e.reason && <span className="text-zinc-500 truncate max-w-[120px]" title={e.reason}>{e.reason}</span>}
                      {Number(e.cost_estimate) > 0 && <span className="text-amber-400 tabular-nums flex-shrink-0">${Number(e.cost_estimate).toFixed(3)}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {cell.planned.length === 0 && cell.execs.length === 0 && (
          <p className="text-[11px] text-zinc-600 text-center py-4">예약·이력 없음</p>
        )}

        <div className="flex gap-2 pt-2 border-t border-white/[0.04]">
          <button
            onClick={onAddSchedule}
            className="flex-1 text-xs py-2 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25"
          >+ 이 날짜에 새 스케줄</button>
          <button
            onClick={onClose}
            className="px-4 text-xs py-2 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
          >닫기</button>
        </div>
      </div>
    </div>
  );
}
