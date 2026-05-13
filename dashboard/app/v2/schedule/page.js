'use client';

import { useEffect, useState, useCallback } from 'react';
import UsageCard from './UsageCard';
import NowPanel from './NowPanel';
import Calendar from './Calendar';
import SettingsSheet from './SettingsSheet';
import ScheduleForm from './ScheduleForm';

// 자동화 메인 — 캘린더 중심. 일자 클릭 → 그 날 예약/이력/편집 sheet.
// 설정 (지오펜스 · 휴무 · 전체 스케줄 · 전체 이력 · 체크리스트) 은 ⚙ 시트로.

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
      const hr = await fetch(`/api/holidays?year=${y}`);
      const hj = hr.ok ? await hr.json() : null;
      const hmap = new Map();
      for (const h of hj?.holidays || []) hmap.set(h.dateymd, h.name);
      setHolidayMap(hmap);

      const er = await fetch('/api/schedules/executions?limit=500');
      const ej = er.ok ? await er.json() : null;
      const exMap = new Map();
      for (const e of ej?.executions || []) {
        const d = new Date(e.triggered_at);
        const kst = new Date(d.getTime() + 9 * 3600 * 1000);
        const key = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}-${String(kst.getUTCDate()).padStart(2, '0')}`;
        if (!key.startsWith(month)) continue;
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

  const onRunNow = async (s) => {
    const r = await fetch(`/api/schedules/${s.id}/run-now`, { method: 'POST' });
    const j = await r.json().catch(() => null);
    const status = j?.result?.status;
    alert(
      status === 'dry_run' ? 'Dry-Run 완료 (Mock — 실제 명령 안 보냄)'
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

  const activeCount = (schedules || []).filter((s) => s.enabled).length;
  const totalCount = (schedules || []).length;

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white pb-32">
      <div className="max-w-2xl mx-auto px-4 pt-3 space-y-3">
        <header className="flex items-center justify-between py-1">
          <h1 className="text-base font-bold text-zinc-100">자동화</h1>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500">
              {process.env.NEXT_PUBLIC_TESLA_FLEET_API_ENABLED === 'true' ? '실연동' : 'Mock'}
            </span>
            <button
              onClick={() => setShowSettings(true)}
              className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center"
              title="설정 — 지오펜스/휴무/전체 목록"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </header>

        <UsageCard usage={usage} />
        <NowPanel onAfterRun={() => { fetchUsage(); bump(); }} />

        <Calendar
          schedules={schedules || []}
          executionsByDate={executionsByDate}
          holidayMap={holidayMap}
          pausePeriods={pausePeriods}
          month={calMonth}
          onChangeMonth={setCalMonth}
          onAddSchedule={openNewFormForDate}
          onEditSchedule={(s) => { setEditing(s); setPrefillDate(null); setShowForm(true); }}
          onDeleteSchedule={onDelete}
          onToggleEnabled={onToggle}
          onRunNow={onRunNow}
          refreshSignal={refreshSignal}
        />

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setEditing(null); setPrefillDate(null); setShowForm(true); }}
            className="flex-1 py-2.5 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 text-sm font-semibold hover:bg-blue-500/25"
          >+ 새 스케줄</button>
          <button
            onClick={() => setShowSettings(true)}
            className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs"
            title="전체 스케줄 목록"
          >
            전체 {activeCount}/{totalCount}
          </button>
        </div>
      </div>

      <SettingsSheet
        open={showSettings}
        onClose={() => setShowSettings(false)}
        schedules={schedules}
        onEdit={(s) => { setEditing(s); setPrefillDate(null); setShowForm(true); }}
        onToggle={onToggle}
        onRunNow={onRunNow}
        onDelete={onDelete}
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
