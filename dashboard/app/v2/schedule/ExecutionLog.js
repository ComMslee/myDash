'use client';

import { useEffect, useState } from 'react';

const STATUS_STYLE = {
  success: { cls: 'bg-emerald-500/15 text-emerald-400', label: '성공' },
  failed: { cls: 'bg-rose-500/15 text-rose-400', label: '실패' },
  skipped: { cls: 'bg-zinc-700/50 text-zinc-400', label: '스킵' },
  dry_run: { cls: 'bg-blue-500/15 text-blue-400', label: 'Dry-Run' },
};

const ACTION_LABEL = {
  sentry_on: '센트리 ON', sentry_off: '센트리 OFF',
  climate_on: '공조 ON', climate_off: '공조 OFF',
  lock: '잠금', unlock: '잠금해제',
  charge_start: '충전 시작', charge_stop: '충전 중지',
  set_charge_limit: '충전 한도', flash_lights: '라이트 점멸',
  check_status: '🔍 차량 상태', wake_up: '⏰ 깨우기',
};

function fmtTs(s) {
  const d = new Date(s);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 전체 통합 실행 이력 — 필터 (상태/스케줄)
export default function ExecutionLog({ schedules }) {
  const [items, setItems] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSchedule, setFilterSchedule] = useState('all');

  useEffect(() => {
    let alive = true;
    fetch('/api/schedules/executions?limit=200')
      .then((r) => r.json())
      .then((j) => { if (alive) setItems(j.executions || []); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, []);

  if (!items) return <p className="text-xs text-zinc-500 py-4 text-center">로딩…</p>;

  const filtered = items.filter((e) => {
    if (filterStatus !== 'all' && e.status !== filterStatus) return false;
    if (filterSchedule === 'manual') {
      if (e.schedule_id != null) return false;
    } else if (filterSchedule !== 'all' && String(e.schedule_id) !== filterSchedule) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-2">
      <div className="bg-[#161618] border border-white/[0.06] rounded-xl p-2 flex items-center gap-2 flex-wrap">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="text-xs bg-zinc-900 border border-white/[0.06] rounded px-2 py-1 text-zinc-300"
        >
          <option value="all">전체 상태</option>
          <option value="success">성공만</option>
          <option value="failed">실패만</option>
          <option value="skipped">스킵만</option>
          <option value="dry_run">Dry-Run</option>
        </select>
        <select
          value={filterSchedule}
          onChange={(e) => setFilterSchedule(e.target.value)}
          className="text-xs bg-zinc-900 border border-white/[0.06] rounded px-2 py-1 text-zinc-300 flex-1 min-w-0"
        >
          <option value="all">전체 스케줄</option>
          <option value="manual">⚡ 즉시 실행 / 테스트</option>
          {schedules?.map((s) => (
            <option key={s.id} value={String(s.id)}>{s.name}</option>
          ))}
        </select>
        <span className="text-[10px] text-zinc-500 tabular-nums">{filtered.length}건</span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-zinc-500 py-6 text-center">표시할 이력이 없습니다</p>
      ) : (
        <div className="bg-[#161618] border border-white/[0.06] rounded-xl overflow-hidden">
          {filtered.slice(0, 100).map((e, i) => {
            const st = STATUS_STYLE[e.status] || STATUS_STYLE.skipped;
            const s = schedules?.find((x) => x.id === e.schedule_id);
            return (
              <div
                key={e.id}
                className={`flex items-center gap-2 px-3 py-2 text-xs border-b border-white/[0.04] last:border-0 ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}`}
              >
                <span className="text-[10px] text-zinc-500 tabular-nums w-16 flex-shrink-0">{fmtTs(e.triggered_at)}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${st.cls} flex-shrink-0`}>{st.label}</span>
                <span className="text-zinc-300 truncate flex-1">
                  {s ? s.name : (e.trigger_source === 'manual_test' ? '진단' : '즉시')} · {ACTION_LABEL[e.action] || e.action}
                </span>
                {e.reason && <span className="text-[10px] text-zinc-500 truncate max-w-[160px]" title={e.reason}>{e.reason}</span>}
                {Number(e.cost_estimate) > 0 && (
                  <span className="text-[10px] text-amber-400 tabular-nums flex-shrink-0">${Number(e.cost_estimate).toFixed(3)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
