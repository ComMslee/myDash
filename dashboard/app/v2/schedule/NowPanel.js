'use client';

import { useState } from 'react';

// 즉시 실행 패널 — 센트리/공조/잠금/충전 on·off + 차량 상태/깨우기 테스트.
// 명령 클릭 → /api/now-command (Mock=dry_run, ENABLED=실호출).
// 차량 상태/깨우기 → /api/tesla-test/{ping|wake}.
// 단가: lib/queries/schedules.js::COST 와 동기 (2025.01.01 기준).

const COST_COMMAND = 0.001;
const COST_WAKE = 0.02;
const COST_VEHICLE_DATA = 0.002;

const ACTIONS = [
  { key: 'sentry', label: '센트리', on: 'sentry_on', off: 'sentry_off', icon: '🛡', cost: COST_COMMAND },
  { key: 'climate', label: '공조', on: 'climate_on', off: 'climate_off', icon: '❄️', cost: COST_COMMAND },
  { key: 'lock', label: '잠금', on: 'lock', off: 'unlock', icon: '🔒', cost: COST_COMMAND },
];

export default function NowPanel({ onAfterRun }) {
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const run = async (action) => {
    setBusy(action);
    try {
      const res = await fetch('/api/now-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => null);
      const ok = res.ok && json?.ok;
      const status = json?.result?.status;
      const msg = ok
        ? (status === 'dry_run' ? `${action} — dry-run (Mock)` : `${action} — 실행 완료`)
        : (json?.error || json?.result?.reason || '실패');
      setToast({ ok, msg });
    } catch (e) {
      setToast({ ok: false, msg: e?.message || 'network 오류' });
    } finally {
      setBusy(null);
      setTimeout(() => setToast(null), 2400);
      onAfterRun?.();
    }
  };

  const checkStatus = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await fetch('/api/tesla-test/ping');
      const j = await r.json();
      setTestResult({ kind: 'status', ok: r.ok, data: j });
    } catch (e) {
      setTestResult({ kind: 'status', ok: false, data: { error: e?.message } });
    } finally { setTesting(false); }
  };

  const wake = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await fetch('/api/tesla-test/wake', { method: 'POST' });
      const j = await r.json();
      setTestResult({ kind: 'wake', ok: r.ok, data: j });
    } catch (e) {
      setTestResult({ kind: 'wake', ok: false, data: { error: e?.message } });
    } finally { setTesting(false); }
  };

  return (
    <div className="space-y-3">
      {/* 명령 그리드 */}
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-500 font-semibold tracking-wide">즉시 실행</p>
          {toast && (
            <span className={`text-[10px] px-2 py-0.5 rounded ${toast.ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
              {toast.msg}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ACTIONS.map((a) => (
            <div key={a.key} className="flex items-center gap-2">
              <span className="text-sm w-20 truncate flex flex-col">
                <span>{a.icon} {a.label}</span>
                <span className="text-[9px] text-zinc-500 leading-none">~${a.cost.toFixed(3)}/회</span>
                {/* commands 단가 $0.001 — lib/queries/schedules.js::COST */}
              </span>
              <button
                onClick={() => run(a.on)}
                disabled={busy != null}
                className="flex-1 text-xs py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-40"
              >
                {busy === a.on ? '…' : 'ON'}
              </button>
              <button
                onClick={() => run(a.off)}
                disabled={busy != null}
                className="flex-1 text-xs py-1.5 rounded-lg bg-zinc-800 text-zinc-400 border border-white/[0.06] hover:bg-zinc-700 disabled:opacity-40"
              >
                {busy === a.off ? '…' : 'OFF'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 진단 — 차량 상태 / 깨우기 */}
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-3 space-y-2">
        <p className="text-xs text-zinc-500 font-semibold tracking-wide">진단</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={checkStatus}
            disabled={testing}
            className="flex flex-col items-center justify-center py-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20 disabled:opacity-50"
          >
            <span className="text-sm">🔍 차량 상태</span>
            <span className="text-[9px] text-zinc-500">~${COST_VEHICLE_DATA.toFixed(3)}/회 (online 일 때만)</span>
          </button>
          <button
            onClick={wake}
            disabled={testing}
            className="flex flex-col items-center justify-center py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 disabled:opacity-50"
          >
            <span className="text-sm">⏰ 깨우기</span>
            <span className="text-[9px] text-amber-400/70">~${COST_WAKE.toFixed(3)}/회 · 약 30초 소요</span>
          </button>
        </div>

        {testing && <p className="text-[11px] text-zinc-500">…호출 중</p>}

        {testResult && testResult.kind === 'status' && (
          <div className="p-2 rounded-lg bg-zinc-900/60 border border-white/[0.06] text-[11px] space-y-1">
            <p className="font-semibold text-zinc-300">차량 상태 {testResult.ok ? '✓' : '✗'}</p>
            {testResult.data?.state && (
              <p className="text-zinc-400">
                state: <span className={
                  testResult.data.state === 'online' ? 'text-emerald-300 font-semibold'
                  : testResult.data.state === 'asleep' ? 'text-blue-300 font-semibold'
                  : 'text-zinc-300 font-semibold'
                }>{testResult.data.state}</span>
                {testResult.data.display_name && <span className="text-zinc-500"> · {testResult.data.display_name}</span>}
              </p>
            )}
            {testResult.data?.vin && !testResult.data?.summary && (
              <p className="text-zinc-400">VIN: <span className="text-zinc-200">{testResult.data.vin}</span></p>
            )}
            {testResult.data?.summary ? (
              <div className="space-y-0.5 text-zinc-400">
                <p>VIN: <span className="text-zinc-200">{testResult.data.summary.vin}</span></p>
                <p>배터리: <span className="text-zinc-200">{testResult.data.summary.battery_level}%</span></p>
                <p>주행거리: <span className="text-zinc-200">{testResult.data.summary.odometer != null ? `${Math.round(testResult.data.summary.odometer * 1.609).toLocaleString()} km` : '—'}</span></p>
                <p>Sentry: <span className="text-zinc-200">{String(testResult.data.summary.sentry_mode)}</span></p>
                <p>버전: <span className="text-zinc-200">{testResult.data.summary.car_version}</span></p>
                <p className="text-zinc-500">비용: ~${Number(testResult.data.cost_estimate || 0).toFixed(3)}</p>
              </div>
            ) : (
              <p className="text-zinc-500">{testResult.data?.note || '응답에 상세 정보 없음'}</p>
            )}
          </div>
        )}

        {testResult && testResult.kind === 'wake' && (
          <div className="p-2 rounded-lg bg-zinc-900/60 border border-white/[0.06] text-[11px] space-y-1">
            <p className="font-semibold text-zinc-300">깨우기 {testResult.ok ? '✓' : '✗'}</p>
            <p className="text-zinc-400">상태: <span className="text-zinc-200">{testResult.data?.state || '—'}</span></p>
            {testResult.data?.note && <p className="text-zinc-500">{testResult.data.note}</p>}
            {testResult.data?.error && <p className="text-red-300">{testResult.data.error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
