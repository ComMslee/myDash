'use client';

import { useState } from 'react';

// 즉시 실행 패널 — 센트리/공조/잠금 on·off 버튼.
// 클릭 → POST /api/now-command — Mock 일 땐 dry_run, ENABLED 일 땐 실호출.
// 결과는 토스트로 잠깐 보여주고 onAfterRun 으로 부모 새로고침 시그널.

const ACTIONS = [
  { key: 'sentry', label: '센트리', on: 'sentry_on', off: 'sentry_off', icon: '🛡' },
  { key: 'climate', label: '공조', on: 'climate_on', off: 'climate_off', icon: '❄️' },
  { key: 'lock', label: '잠금', on: 'lock', off: 'unlock', icon: '🔒' },
  { key: 'charge', label: '충전', on: 'charge_start', off: 'charge_stop', icon: '⚡' },
];

export default function NowPanel({ onAfterRun }) {
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);

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

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500 font-semibold tracking-wide">즉시 실행</p>
        {toast && (
          <span className={`text-[10px] px-2 py-0.5 rounded ${toast.ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
            {toast.msg}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {ACTIONS.map((a) => (
          <div key={a.key} className="flex items-center gap-2">
            <span className="text-sm w-14 truncate">{a.icon} {a.label}</span>
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
  );
}
