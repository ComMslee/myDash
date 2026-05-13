'use client';

import { useEffect, useRef, useState } from 'react';

const ACTION_LABEL = {
  sentry_on: '센트리 ON',
  sentry_off: '센트리 OFF',
  climate_on: '공조 ON',
  climate_off: '공조 OFF',
  lock: '잠금',
  unlock: '잠금해제',
  charge_start: '충전 시작',
  charge_stop: '충전 중지',
  set_charge_limit: '충전 한도',
  flash_lights: '라이트 점멸',
};

const DOW_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DOW_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

// 인라인 7건 칩 — 최근 실행 결과 시각화
function ExecChips({ schedule_id }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/schedules/${schedule_id}/executions?limit=7`)
      .then((r) => r.json())
      .then((j) => { if (alive) setItems(j.executions || []); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [schedule_id]);
  if (!items) return <span className="text-[10px] text-zinc-700">…</span>;
  if (items.length === 0) return <span className="text-[10px] text-zinc-700">실행 이력 없음</span>;
  return (
    <span className="inline-flex items-center gap-0.5">
      {items.slice(0, 7).reverse().map((e) => (
        <span
          key={e.id}
          title={`${new Date(e.triggered_at).toLocaleString('ko-KR')} — ${e.status}${e.reason ? ': ' + e.reason : ''}`}
          className={`inline-block w-2 h-2 rounded-full ${
            e.status === 'success' ? 'bg-emerald-400'
            : e.status === 'failed' ? 'bg-rose-400'
            : e.status === 'skipped' ? 'bg-zinc-600'
            : 'bg-blue-400/60'
          }`}
        />
      ))}
    </span>
  );
}

function triggerSummary(trigger_config) {
  const t = trigger_config || {};
  const parts = [];
  if (t.time) {
    const hhmm = t.time.hhmm || '';
    parts.push(`🕐 ${hhmm}`);
  }
  if (t.location) {
    const placeLabel = { home: '집', work: '회사', outside: '외부' }[t.location.place] || '커스텀';
    const evLabel = { at: '머무는 동안', enter: '도착 시', exit: '출발 시' }[t.location.event] || '';
    parts.push(`📍 ${placeLabel} ${evLabel}`);
  }
  if (t.weather) {
    const w = t.weather;
    const wp = [];
    if (w.temp_max != null) wp.push(`≤${w.temp_max}°`);
    if (w.temp_min != null) wp.push(`≥${w.temp_min}°`);
    if (w.precip && w.precip !== 'none') wp.push(w.precip === 'rain' ? '비' : w.precip === 'snow' ? '눈' : '강수');
    parts.push(`🌤 ${wp.join(' ')}`);
  }
  return parts.join('  ');
}

function ScheduleRow({ s, onEdit, onToggle, onRunNow, onDelete, onUpdate }) {
  const dateRef = useRef(null);
  const days = s.trigger_config?.time?.days || [];
  const hasTime = !!s.trigger_config?.time;
  const skipDates = Array.isArray(s.skip_dates) ? s.skip_dates : [];

  const toggleDay = (d) => {
    const cur = days;
    let next;
    if (cur.length === 0) {
      next = DOW_KEYS.filter((x) => x !== d);
    } else if (cur.includes(d)) {
      next = cur.filter((x) => x !== d);
      if (next.length === 0) next = [];
    } else {
      next = [...cur, d];
      if (next.length === 7) next = [];
    }
    const tc = {
      ...(s.trigger_config || {}),
      time: { ...(s.trigger_config?.time || {}), days: next },
    };
    onUpdate?.(s, { trigger_config: tc });
  };

  const addSkipDate = () => {
    const el = dateRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') el.showPicker();
    else el.click();
  };

  const onSkipDateChange = (e) => {
    const val = e.target.value;
    e.target.value = '';
    if (!val) return;
    if (skipDates.includes(val)) return;
    onUpdate?.(s, { skip_dates: [...skipDates, val] });
  };

  const removeSkipDate = (d) => {
    onUpdate?.(s, { skip_dates: skipDates.filter((x) => x !== d) });
  };

  return (
    <div className={`bg-[#161618] border rounded-2xl p-3 ${s.enabled ? 'border-white/[0.06]' : 'border-white/[0.03] opacity-60'}`}>
      <div className="flex items-center gap-2 mb-1">
        <button
          onClick={() => onToggle(s)}
          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.enabled ? 'bg-emerald-400' : 'bg-zinc-600'}`}
          title={s.enabled ? '활성' : '비활성'}
        />
        <p className="text-sm font-semibold text-zinc-200 flex-1 truncate">{s.name}</p>
        <span className="text-[10px] text-zinc-500">{ACTION_LABEL[s.action] || s.action}</span>
      </div>
      <p className="text-[11px] text-zinc-500 mb-1.5">{triggerSummary(s.trigger_config) || '조건 없음'}</p>

      <div className={`flex items-center gap-0.5 mb-1.5 ${hasTime ? '' : 'opacity-40'}`}>
        <span className="text-[10px] text-zinc-600 w-8 flex-shrink-0">요일</span>
        {DOW_KEYS.map((d, i) => {
          const active = days.length === 0 || days.includes(d);
          const dowCls = i === 5 ? 'text-sky-400' : i === 6 ? 'text-rose-400' : '';
          return (
            <button
              key={d}
              disabled={!hasTime}
              onClick={() => toggleDay(d)}
              className={`text-[10px] w-6 h-6 rounded ${active ? `bg-blue-500/20 ${dowCls || 'text-blue-300'}` : 'bg-zinc-900 text-zinc-600 hover:text-zinc-400'}`}
            >{DOW_LABELS[i]}</button>
          );
        })}
      </div>

      <div className="flex items-center gap-1 flex-wrap mb-2">
        <span className="text-[10px] text-zinc-600 w-8 flex-shrink-0">skip</span>
        {skipDates.length === 0 && <span className="text-[10px] text-zinc-700">없음</span>}
        {skipDates.map((d) => (
          <span key={d} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 inline-flex items-center gap-1 tabular-nums">
            {d.slice(5).replace('-', '/')}
            <button onClick={() => removeSkipDate(d)} className="text-rose-400 hover:text-rose-300">×</button>
          </span>
        ))}
        <button
          onClick={addSkipDate}
          className="text-[10px] px-1.5 py-0.5 rounded border border-dashed border-white/[0.1] text-zinc-500 hover:text-zinc-300"
        >+ 일자</button>
        <input ref={dateRef} type="date" onChange={onSkipDateChange} className="sr-only" tabIndex={-1} />
      </div>

      <div className="flex items-center gap-2">
        <ExecChips schedule_id={s.id} />
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => onRunNow(s)} className="text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300" title="지금 1회 실행">▶ 실행</button>
          <button onClick={() => onEdit(s)} className="text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">편집</button>
          <button onClick={() => onDelete(s)} className="text-[10px] px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400">삭제</button>
        </div>
      </div>
    </div>
  );
}

export default function ScheduleList({ schedules, onEdit, onToggle, onRunNow, onDelete, onUpdate, onAdd }) {
  if (!schedules) return <p className="text-xs text-zinc-500 py-4 text-center">로딩…</p>;

  return (
    <div className="space-y-2">
      {schedules.length === 0 ? (
        <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-6 text-center">
          <p className="text-sm text-zinc-400">등록된 스케줄이 없습니다</p>
        </div>
      ) : (
        schedules.map((s) => (
          <ScheduleRow
            key={s.id}
            s={s}
            onEdit={onEdit}
            onToggle={onToggle}
            onRunNow={onRunNow}
            onDelete={onDelete}
            onUpdate={onUpdate}
          />
        ))
      )}
      <button
        onClick={onAdd}
        className="w-full py-2.5 rounded-2xl bg-blue-500/10 border border-dashed border-blue-500/30 text-blue-400 text-sm font-semibold hover:bg-blue-500/20"
      >+ 새 스케줄</button>
    </div>
  );
}
