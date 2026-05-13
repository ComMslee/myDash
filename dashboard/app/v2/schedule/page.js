'use client';

import { useEffect, useState, useCallback } from 'react';
import UsageCard from './UsageCard';
import Calendar from './Calendar';
import SettingsSheet from './SettingsSheet';
import ScheduleForm from './ScheduleForm';
import PausePanel from './PausePanel';
import ScheduleList from './ScheduleList';
import ExecutionLog from './ExecutionLog';

// 자동화 메인 — 캘린더 중심.
// ⚙ 시트 = 즉시실행 · 지오펜스 · 실연동 체크 (드물게 쓰는 것만).
// 메인 인라인 = 휴무 / 전체 스케줄 / 전체 이력 (자주 보는 것).

function kstMonth(d = new Date()) {
  const t = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function SchedulePage() {
  const [usage, setUsage] = useState(null);
  const [schedules, setSchedules] = useState(null);
  const [geofences, setGeofences] = useState([]);
  const [pausePeriods, setPausePeriods] = useState([]);
  const [holidayMap, setHolidayMap] = useState(new Map());
  const [executionsByDate, setExecutionsByDate] = useState(new Map());
  const [calMonth, setCalMonth] = useState(() => kstMonth());
  const [refreshSignal, setRefreshSignal] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [prefillDate, setPrefillDate] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const bump = () => setRefreshSignal((n) => n + 1);

  const fetchUsage = useCallback(async () => {
    try {
      const r = await fetch('/api/usage/current-month');
      if (r.ok) setUsage(await r.json());
    } catch {}
  }, []);

  const fetchSchedules = useCallback(async () => {
    try {
      const r = await fetch('/api/schedules');
      if (r.ok) {
        const j = await r.json();
        setSchedules(j.schedules || []);
      }
    } catch {}
  }, []);

  const fetchGeofences = useCallback(async () => {
    try {
      const r = await fetch('/api/geofences');
      if (r.ok) {
        const j = await r.json();
        setGeofences(j.geofences || []);
      }
    } catch {}
  }, []);

  const fetchPause = useCallback(async () => {
    try {
      const r = await fetch('/api/pause-periods');
      if (r.ok) {
        const j = await r.json();
        setPausePeriods(j.pause_periods || []);
      }
    } catch {}
  }, []);

  const fetchCalendarData = useCallback(async (month) => {
    try {
      const [y] = month.split('-');
      const yNum = parseInt(y, 10);
      // ±1 년 공휴일 (월 달력 모달에서 인접 연도 이동 가능)
      const years = [yNum - 1, yNum, yNum + 1];
      const hmap = new Map();
      const holidayResults = await Promise.all(years.map((yy) => fetch(`/api/holidays?year=${yy}`).then((r) => r.ok ? r.json() : null).catch(() => null)));
      for (const hj of holidayResults) {
        for (const h of hj?.holidays || []) hmap.set(h.dateymd, h.name);
      }
      setHolidayMap(hmap);

      const er = await fetch('/api/schedules/executions?limit=500');
      const ej = er.ok ? await er.json() : null;
      const exMap = new Map();
      for (const e of ej?.executions || []) {
        const d = new Date(e.triggered_at);
        const kst = new Date(d.getTime() + 9 * 3600 * 1000);
        const key = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}-${String(kst.getUTCDate()).padStart(2, '0')}`;
        if (!exMap.has(key)) exMap.set(key, []);
        exMap.get(key).push(e);
      }
      setExecutionsByDate(exMap);
    } catch {}
  }, []);

  useEffect(() => {
    fetchUsage();
    fetchSchedules();
    fetchGeofences();
    fetchPause();
  }, [fetchUsage, fetchSchedules, fetchGeofences, fetchPause]);

  useEffect(() => { fetchCalendarData(calMonth); }, [calMonth, fetchCalendarData, refreshSignal]);

  const onSave = async (payload) => {
    const isEdit = !!editing?.id;
    const url = isEdit ? `/api/schedules/${editing.id}` : '/api/schedules';
    const method = isEdit ? 'PUT' : 'POST';
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      alert('저장 실패: ' + (err.error || r.statusText));
      return;
    }
    setShowForm(false);
    setEditing(null);
    setPrefillDate(null);
    await fetchSchedules();
    bump();
  };

  const onToggle = async (s) => {
    await fetch(`/api/schedules/${s.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...s, enabled: !s.enabled }),
    });
    await fetchSchedules();
    bump();
  };

  const onDelete = async (s) => {
    if (!confirm(`"${s.name}" 삭제할까요?`)) return;
    await fetch(`/api/schedules/${s.id}`, { method: 'DELETE' });
    await fetchSchedules();
    bump();
  };

  const onToggleSkip = async (s, dateStr) => {
    const dates = Array.isArray(s.skip_dates) ? [...s.skip_dates] : [];
    const idx = dates.indexOf(dateStr);
    if (idx >= 0) dates.splice(idx, 1);
    else dates.push(dateStr);
    const r = await fetch(`/api/schedules/${s.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...s, skip_dates: dates }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      alert('skip 토글 실패: ' + (err.error || r.statusText));
      return;
    }
    await fetchSchedules();
    bump();
  };

  const onUpdateSchedule = async (s, patch) => {
    const r = await fetch(`/api/schedules/${s.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...s, ...patch }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      alert('변경 실패: ' + (err.error || r.statusText));
      return;
    }
    await fetchSchedules();
    bump();
  };

  const onRunNow = async (s) => {
    const r = await fetch(`/api/schedules/${s.id}/run-now`, { method: 'POST' });
    const j = await r.json().catch(() => null);
    const status = j?.result?.status;
    alert(
      status === 'dry_run' ? 'Dry-Run 완료 (실제 명령 안 보냄)'
      : status === 'success' ? '실행 완료'
      : `결과: ${status} ${j?.result?.reason || ''}`,
    );
    await fetchUsage();
    await fetchSchedules();
    bump();
  };

  const openNewFormForDate = (dateStr) => {
    setEditing(null);
    setPrefillDate(dateStr);
    setShowForm(true);
  };

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white pb-32">
      <div className="max-w-2xl mx-auto px-4 pt-3 space-y-3">
        <header className="flex items-center justify-between py-1">
          <h1 className="text-base font-bold text-zinc-100">자동화</h1>
          <button
            onClick={() => setShowSettings(true)}
            className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center"
            title="설정 — 즉시실행/지오펜스/실연동 체크"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </header>

        <UsageCard usage={usage} />

        <Calendar
          schedules={schedules || []}
          executionsByDate={executionsByDate}
          holidayMap={holidayMap}
          pausePeriods={pausePeriods}
          onAddSchedule={openNewFormForDate}
          onEditSchedule={(s) => { setEditing(s); setPrefillDate(null); setShowForm(true); }}
          onRunNow={onRunNow}
          onToggleSkip={onToggleSkip}
          refreshSignal={refreshSignal}
        />

        <PausePanel pausePeriods={pausePeriods} onChange={async () => { await fetchPause(); bump(); }} />

        <section>
          <p className="text-xs text-zinc-500 font-semibold tracking-wide mb-1.5 px-1">📋 전체 스케줄</p>
          <ScheduleList
            schedules={schedules}
            onEdit={(s) => { setEditing(s); setPrefillDate(null); setShowForm(true); }}
            onToggle={onToggle}
            onRunNow={onRunNow}
            onDelete={onDelete}
            onUpdate={onUpdateSchedule}
            onAdd={() => { setEditing(null); setPrefillDate(null); setShowForm(true); }}
          />
        </section>

        <section>
          <p className="text-xs text-zinc-500 font-semibold tracking-wide mb-1.5 px-1">📜 전체 이력</p>
          <ExecutionLog schedules={schedules || []} />
        </section>
      </div>

      <SettingsSheet
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onRunNow={onRunNow}
        onAfterRun={() => { fetchUsage(); bump(); }}
      />

      {showForm && (
        <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-2 overflow-y-auto">
          <div className="w-full max-w-2xl my-4">
            <ScheduleForm
              initial={editing}
              prefillDate={prefillDate}
              geofences={geofences}
              onSave={onSave}
              onCancel={() => { setShowForm(false); setEditing(null); setPrefillDate(null); }}
              onTestRun={async () => { alert('저장 후 실행 — 먼저 저장해주세요'); }}
            />
          </div>
        </div>
      )}
    </main>
  );
}
