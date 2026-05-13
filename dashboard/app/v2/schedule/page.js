'use client';

import { useEffect, useState, useCallback } from 'react';
import UsageCard from './UsageCard';
import NowPanel from './NowPanel';
import ScheduleList from './ScheduleList';
import ScheduleForm from './ScheduleForm';
import ExecutionLog from './ExecutionLog';
import PausePanel from './PausePanel';
import GeofencesPanel from './GeofencesPanel';

const TABS = [
  { key: 'schedules', label: '📋 스케줄' },
  { key: 'executions', label: '📜 이력' },
  { key: 'config', label: '⚙ 설정' },
];

export default function SchedulePage() {
  const [tab, setTab] = useState('schedules');
  const [usage, setUsage] = useState(null);
  const [schedules, setSchedules] = useState(null);
  const [geofences, setGeofences] = useState([]);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

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

  useEffect(() => {
    fetchUsage();
    fetchSchedules();
    fetchGeofences();
  }, [fetchUsage, fetchSchedules, fetchGeofences]);

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
    await fetchSchedules();
  };

  const onToggle = async (s) => {
    await fetch(`/api/schedules/${s.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...s, enabled: !s.enabled }),
    });
    await fetchSchedules();
  };

  const onDelete = async (s) => {
    if (!confirm(`"${s.name}" 삭제할까요?`)) return;
    await fetch(`/api/schedules/${s.id}`, { method: 'DELETE' });
    await fetchSchedules();
  };

  const onRunNow = async (s) => {
    const r = await fetch(`/api/schedules/${s.id}/run-now`, { method: 'POST' });
    const j = await r.json().catch(() => null);
    const status = j?.result?.status;
    alert(status === 'dry_run' ? 'Dry-Run 완료 (Mock — 실제 명령 안 보냄)' : status === 'success' ? '실행 완료' : `결과: ${status} ${j?.result?.reason || ''}`);
    await fetchUsage();
    await fetchSchedules();
  };

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white pb-32">
      <div className="max-w-2xl mx-auto px-4 pt-3 space-y-3">
        <header className="flex items-center justify-between py-1">
          <h1 className="text-base font-bold text-zinc-100">자동화</h1>
          <span className="text-[10px] text-zinc-500">
            Tesla Fleet API · {process.env.NEXT_PUBLIC_TESLA_FLEET_API_ENABLED === 'true' ? '실연동' : 'Mock'}
          </span>
        </header>

        <UsageCard usage={usage} />
        <NowPanel onAfterRun={fetchUsage} />

        <div className="flex items-center gap-1 bg-[#161618] border border-white/[0.06] rounded-xl p-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 text-xs px-2 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                tab === t.key
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >{t.label}</button>
          ))}
        </div>

        {tab === 'schedules' && (
          <>
            <button
              onClick={() => { setEditing(null); setShowForm(true); }}
              className="w-full py-2 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 text-sm font-semibold hover:bg-blue-500/25"
            >+ 새 스케줄</button>
            <ScheduleList
              schedules={schedules}
              onEdit={(s) => { setEditing(s); setShowForm(true); }}
              onToggle={onToggle}
              onRunNow={onRunNow}
              onDelete={onDelete}
            />
          </>
        )}

        {tab === 'executions' && (
          <ExecutionLog schedules={schedules || []} />
        )}

        {tab === 'config' && (
          <>
            <GeofencesPanel />
            <PausePanel />
            <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-3 text-[11px] text-zinc-500 space-y-1.5">
              <p className="font-semibold text-zinc-400 text-xs">실연동 체크리스트</p>
              <p>• 기상청 API 키 → 환경변수 <span className="text-zinc-300">KMA_API_KEY</span></p>
              <p>• Tesla Developer 앱 등록 → <span className="text-zinc-300">TESLA_FLEET_CLIENT_ID / _SECRET</span></p>
              <p>• OAuth + Virtual Key 페어링 → access token</p>
              <p>• <span className="text-zinc-300">TESLA_FLEET_API_ENABLED=true</span> 환경변수 토글 (현재 Mock)</p>
              <p>• 결제수단 미등록 권장 — $10 한도 초과 시 자동 차단 (청구 X)</p>
            </div>
          </>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-2 overflow-y-auto">
          <div className="w-full max-w-2xl my-4">
            <ScheduleForm
              initial={editing}
              geofences={geofences}
              onSave={onSave}
              onCancel={() => { setShowForm(false); setEditing(null); }}
              onTestRun={async (payload) => {
                alert('저장 후 실행 — 먼저 저장해주세요');
              }}
            />
          </div>
        </div>
      )}
    </main>
  );
}
