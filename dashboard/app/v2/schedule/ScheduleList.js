'use client';

import { useEffect, useState } from 'react';

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
    const days = Array.isArray(t.time.days) ? t.time.days : [];
    const dayLabel = days.length === 0 || days.length === 7
      ? '매일'
      : days.length === 5 && ['mon','tue','wed','thu','fri'].every(d => days.includes(d))
        ? '평일'
        : days.length === 2 && ['sat','sun'].every(d => days.includes(d))
          ? '주말'
          : days.map(d => ({mon:'월',tue:'화',wed:'수',thu:'목',fri:'금',sat:'토',sun:'일'}[d])).join('');
    parts.push(`🕐 ${hhmm} ${dayLabel}`);
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

export default function ScheduleList({ schedules, onEdit, onToggle, onRunNow, onDelete }) {
  if (!schedules) {
    return <p className="text-xs text-zinc-500 py-4 text-center">로딩…</p>;
  }
  if (schedules.length === 0) {
    return (
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-6 text-center">
        <p className="text-sm text-zinc-400">등록된 스케줄이 없습니다</p>
        <p className="text-[10px] text-zinc-600 mt-1">+ 새 스케줄 버튼으로 시작</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {schedules.map((s) => (
        <div
          key={s.id}
          className={`bg-[#161618] border rounded-2xl p-3 ${s.enabled ? 'border-white/[0.06]' : 'border-white/[0.03] opacity-60'}`}
        >
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
          <div className="flex items-center gap-2">
            <ExecChips schedule_id={s.id} />
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => onRunNow(s)}
                className="text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                title="지금 1회 실행 (dry-run/실행)"
              >▶ 실행</button>
              <button
                onClick={() => onEdit(s)}
                className="text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              >편집</button>
              <button
                onClick={() => onDelete(s)}
                className="text-[10px] px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400"
              >삭제</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
