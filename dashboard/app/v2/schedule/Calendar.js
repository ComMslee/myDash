'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

// 세로 타임라인 — 월 grid 제거. 위: 과거 이력 · 가운데: 오늘 · 아래: 미래 예약.
// 진입 시 오늘 row 가 viewport 중앙으로 자동 스크롤.

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

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function dowOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function isPausedOn(dateStr, pausePeriods) {
  if (!pausePeriods) return false;
  return pausePeriods.some((p) => p.from_date <= dateStr && dateStr <= p.until_date);
}

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
  onAddSchedule,
  onEditSchedule,
  onRunNow,
  onToggleSkip,
  refreshSignal,
}) {
  const today = todayStr();
  const [backDays, setBackDays] = useState(14);
  const [fwdDays, setFwdDays] = useState(14);
  const [target, setTarget] = useState(null);
  const todayRef = useRef(null);
  const targetRef = useRef(null);
  const containerRef = useRef(null);
  const dateInputRef = useRef(null);

  const nowKstHHMM = useMemo(() => {
    const t = new Date(Date.now() + 9 * 3600 * 1000);
    return `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`;
  }, [refreshSignal]);

  const rows = useMemo(() => {
    const arr = [];
    for (let i = -backDays; i <= fwdDays; i++) {
      const dateStr = addDays(today, i);
      const dow = dowOf(dateStr);
      const ymd = dateStr.replace(/-/g, '');
      const holidayName = holidayMap.get(ymd) || null;
      const isHoliday = !!holidayName;
      const paused = isPausedOn(dateStr, pausePeriods);
      const isToday = dateStr === today;
      const isPast = dateStr < today;

      const planned = [];
      for (const s of schedules) {
        const r = resolveScheduleForDate(s, dateStr, isHoliday, dow);
        if (r) planned.push({ s, ...r });
      }
      planned.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      const execs = executionsByDate.get(dateStr) || [];

      arr.push({ dateStr, dow, isHoliday, holidayName, paused, isToday, isPast, planned, execs });
    }
    return arr;
  }, [today, backDays, fwdDays, schedules, executionsByDate, holidayMap, pausePeriods, refreshSignal]);

  // 다음 실행 — 오늘 이후 가장 빠른 미래
  const nextRun = useMemo(() => {
    let best = null;
    for (const r of rows) {
      if (r.dateStr < today) continue;
      for (const p of r.planned) {
        if (p.certainty === 'skip') continue;
        if (!/^\d{2}:\d{2}$/.test(p.time || '')) continue;
        if (r.dateStr === today && p.time <= nowKstHHMM) continue;
        const key = `${r.dateStr} ${p.time}`;
        if (!best || key < best.key) best = { key, dateStr: r.dateStr, time: p.time, label: p.label, name: p.s.name };
      }
    }
    return best;
  }, [rows, today, nowKstHHMM]);

  // 마지막 실행
  const lastRun = useMemo(() => {
    let latest = null;
    for (const [, list] of executionsByDate) {
      for (const e of list) {
        if (!latest || new Date(e.triggered_at) > new Date(latest.triggered_at)) latest = e;
      }
    }
    return latest;
  }, [executionsByDate]);

  // 진입 시 오늘 row 자동 스크롤 — 한 번만
  const didScrollRef = useRef(false);
  useEffect(() => {
    if (didScrollRef.current) return;
    if (todayRef.current) {
      todayRef.current.scrollIntoView({ block: 'center', behavior: 'auto' });
      didScrollRef.current = true;
    }
  }, [rows]);

  const jumpToday = () => {
    setTarget(null);
    todayRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  useEffect(() => {
    if (target && targetRef.current) {
      targetRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [target, rows]);

  const openDatePicker = () => {
    const el = dateInputRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') el.showPicker();
    else el.click();
  };

  const onPickDate = (e) => {
    const val = e.target.value;
    e.target.value = '';
    if (!val) return;
    const [y, m, d] = val.split('-').map((x) => parseInt(x, 10));
    const [ty, tm, td] = today.split('-').map((x) => parseInt(x, 10));
    const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
    if (diff < 0 && Math.abs(diff) > backDays) setBackDays(Math.abs(diff) + 3);
    if (diff > 0 && diff > fwdDays) setFwdDays(diff + 3);
    setTarget(val);
  };

  return (
    <div className="space-y-2">
      <HotBar next={nextRun} last={lastRun} today={today} onJump={() => jumpToday()} />

      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-2">
        <div className="flex items-center justify-center gap-2 px-2 py-1">
          <button
            onClick={jumpToday}
            className="text-[10px] px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 hover:bg-blue-500/25"
          >오늘로</button>
          <button
            onClick={openDatePicker}
            className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
          >📅 더보기</button>
          <input
            ref={dateInputRef}
            type="date"
            onChange={onPickDate}
            className="sr-only"
            tabIndex={-1}
          />
        </div>

        <div ref={containerRef} className="max-h-[70vh] overflow-y-auto px-1 py-1 space-y-1">
          {rows.map((r) => (
            <div
              key={r.dateStr}
              ref={r.dateStr === target ? targetRef : r.isToday ? todayRef : null}
            >
              <DayRow
                r={r}
                today={today}
                isTodayRow={r.isToday}
                isTarget={r.dateStr === target && !r.isToday}
                onAddSchedule={onAddSchedule}
                onEditSchedule={onEditSchedule}
                onRunNow={onRunNow}
                onToggleSkip={onToggleSkip}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HotBar({ next, last, today, onJump }) {
  const fmtNext = () => {
    if (!next) return null;
    const sameDay = next.dateStr === today;
    const dStr = sameDay ? '오늘' : next.dateStr.slice(5).replace('-', '/');
    return { dStr, ...next };
  };
  const fmtLast = () => {
    if (!last) return null;
    const t = new Date(last.triggered_at);
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    const ymd = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    const sameDay = ymd === today;
    const dStr = sameDay ? '오늘' : ymd.slice(5).replace('-', '/');
    const diffMin = Math.round((Date.now() - t.getTime()) / 60000);
    const ago = diffMin < 60 ? `${diffMin}분 전` : diffMin < 1440 ? `${Math.round(diffMin / 60)}시간 전` : `${Math.round(diffMin / 1440)}일 전`;
    return { dStr, time: `${hh}:${mm}`, status: last.status, action: last.action, ago };
  };
  const n = fmtNext();
  const l = fmtLast();
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        onClick={onJump}
        className={`text-left rounded-2xl p-2.5 border ${n ? 'bg-[#161618] border-blue-500/20 hover:bg-blue-500/5' : 'bg-[#161618] border-white/[0.04] opacity-50'}`}
      >
        <p className="text-[10px] text-zinc-500 font-semibold mb-0.5">⏭ 다음 실행</p>
        {n ? (
          <>
            <p className="text-[11px] text-blue-300 tabular-nums font-mono">{n.dStr} {n.time}</p>
            <p className="text-[10px] text-zinc-300 truncate">{n.label}</p>
          </>
        ) : (
          <p className="text-[11px] text-zinc-600">예정 없음</p>
        )}
      </button>
      <button
        onClick={onJump}
        className={`text-left rounded-2xl p-2.5 border ${l ? 'bg-[#161618] border-emerald-500/20 hover:bg-emerald-500/5' : 'bg-[#161618] border-white/[0.04] opacity-50'}`}
      >
        <p className="text-[10px] text-zinc-500 font-semibold mb-0.5">⏮ 마지막 실행</p>
        {l ? (
          <>
            <p className="text-[11px] tabular-nums font-mono">
              <span className={l.status === 'failed' ? 'text-rose-300' : l.status === 'success' ? 'text-emerald-300' : 'text-blue-300'}>{l.dStr} {l.time}</span>
              <span className="text-zinc-500"> · {l.ago}</span>
            </p>
            <p className="text-[10px] text-zinc-300 truncate">{ACTION_LABEL[l.action] || l.action} <span className="text-zinc-500">· {l.status}</span></p>
          </>
        ) : (
          <p className="text-[11px] text-zinc-600">이력 없음</p>
        )}
      </button>
    </div>
  );
}

function DayRow({ r, today, isTodayRow, isTarget, onAddSchedule, onEditSchedule, onRunNow, onToggleSkip }) {
  const dowCls = r.dow === 0 || r.isHoliday ? 'text-rose-400' : r.dow === 6 ? 'text-sky-400' : 'text-zinc-300';
  const isPast = r.isPast;
  const headerCls = isTodayRow
    ? 'bg-blue-500/15 border-blue-500/40 ring-1 ring-blue-500/30'
    : isTarget
      ? 'bg-violet-500/10 border-violet-500/30 ring-1 ring-violet-500/30'
      : r.paused
        ? 'bg-amber-500/5 border-amber-500/10'
        : 'bg-zinc-900/50 border-white/[0.04]';

  const items = isPast
    ? r.execs.map((e) => ({ kind: 'exec', e }))
    : r.planned.map((p) => ({ kind: 'plan', p }));
  // 오늘은 plan + exec 둘 다
  const todayItems = isTodayRow
    ? [
        ...r.execs.map((e) => ({ kind: 'exec', e, sortKey: new Date(e.triggered_at).toTimeString().slice(0, 5) })),
        ...r.planned.map((p) => ({ kind: 'plan', p, sortKey: p.time || '00:00' })),
      ].sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    : items;

  return (
    <div className={`rounded-lg border p-2 ${headerCls}`}>
      <div className="flex items-center gap-2 mb-1">
        {isTodayRow && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/30 text-blue-200 font-bold">오늘</span>}
        <span className={`text-xs font-bold tabular-nums ${dowCls}`}>{r.dateStr.slice(5).replace('-', '/')}</span>
        <span className={`text-[10px] ${dowCls}`}>{WEEKDAY_KO[r.dow]}</span>
        {r.holidayName && <span className="text-[10px] text-rose-400">· {r.holidayName}</span>}
        {r.paused && <span className="text-[10px] text-amber-400">· ✈ 휴무</span>}
        {!isPast && (
          <button
            onClick={() => onAddSchedule?.(r.dateStr)}
            className="ml-auto text-[10px] text-zinc-500 hover:text-blue-300"
            title="이 날짜 새 스케줄"
          >+</button>
        )}
      </div>

      {todayItems.length === 0 ? (
        <p className="text-[10px] text-zinc-700 px-1">—</p>
      ) : (
        <div className="space-y-1">
          {todayItems.map((it, i) => {
            if (it.kind === 'exec') {
              const cls = CHIP_CLS[it.e.status] || CHIP_CLS.skipped;
              const t = new Date(it.e.triggered_at);
              const tStr = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
              return (
                <div key={`e${i}`} className="flex items-center gap-2 px-1 text-[11px]">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${cls} flex-shrink-0`}>{it.e.status === 'success' ? '✓' : it.e.status === 'failed' ? '✗' : it.e.status === 'dry_run' ? '◎' : '·'}</span>
                  <span className="text-zinc-500 tabular-nums w-10 flex-shrink-0">{tStr}</span>
                  <span className="text-zinc-300 truncate flex-1">{ACTION_LABEL[it.e.action] || it.e.action}</span>
                  {it.e.reason && <span className="text-zinc-600 text-[10px] truncate max-w-[100px]" title={it.e.reason}>{it.e.reason}</span>}
                </div>
              );
            }
            const { s, time, certainty, label } = it.p;
            const cls = CHIP_CLS[certainty];
            const isSkipped = certainty === 'skip';
            return (
              <div key={`p${s.id}`} className="flex items-center gap-2 px-1 text-[11px]">
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${cls} font-mono tabular-nums flex-shrink-0`}>{time || '—'}</span>
                <span className={`truncate flex-1 ${isSkipped ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>{label} <span className="text-zinc-500">· {s.name}</span></span>
                <button
                  onClick={() => onToggleSkip?.(s, r.dateStr)}
                  className={`text-[10px] px-1 py-0.5 rounded ${isSkipped ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400'}`}
                  title={isSkipped ? '이 날만 복원' : '이 날만 skip'}
                >{isSkipped ? '복원' : '⏸'}</button>
                <button onClick={() => onRunNow?.(s)} className="text-[10px] px-1 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">▶</button>
                <button onClick={() => onEditSchedule?.(s)} className="text-[10px] px-1 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">편집</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
