'use client';

import { useEffect, useState } from 'react';

// 휴무 모드 — 일자 범위 내에 모든 자동화 일시정지 (apply_pause_mode=true 인 것만 적용)

export default function PausePanel() {
  const [items, setItems] = useState(null);
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await fetch('/api/pause-periods');
    const j = await r.json().catch(() => null);
    setItems(j?.pause_periods || []);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!from || !until) return;
    setBusy(true);
    try {
      await fetch('/api/pause-periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_date: from, until_date: until, reason }),
      });
      setFrom(''); setUntil(''); setReason('');
      await load();
    } finally { setBusy(false); }
  };

  const remove = async (id) => {
    await fetch(`/api/pause-periods/${id}`, { method: 'DELETE' });
    await load();
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500 font-semibold tracking-wide">휴무 모드</p>
        <p className="text-[10px] text-zinc-600">범위 내 모든 자동화 정지</p>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
          className="text-xs bg-zinc-900 border border-white/[0.06] rounded px-2 py-1 text-zinc-300" />
        <span className="text-zinc-600 text-xs">~</span>
        <input type="date" value={until} onChange={(e) => setUntil(e.target.value)}
          className="text-xs bg-zinc-900 border border-white/[0.06] rounded px-2 py-1 text-zinc-300" />
        <input
          type="text" value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="사유 (선택)"
          className="text-xs bg-zinc-900 border border-white/[0.06] rounded px-2 py-1 text-zinc-300 flex-1 min-w-[80px]"
        />
        <button
          onClick={add}
          disabled={busy || !from || !until}
          className="text-xs px-3 py-1 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 disabled:opacity-40"
        >추가</button>
      </div>

      {items && items.length > 0 && (
        <div className="space-y-1">
          {items.map((p) => {
            const ongoing = p.from_date <= today && today <= p.until_date;
            return (
              <div key={p.id} className={`flex items-center gap-2 px-2 py-1.5 rounded ${ongoing ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-zinc-900 border border-white/[0.04]'}`}>
                <span className="text-xs text-zinc-300 tabular-nums">{p.from_date} ~ {p.until_date}</span>
                {ongoing && <span className="text-[10px] px-1 rounded bg-amber-500/20 text-amber-400">진행 중</span>}
                <span className="text-[10px] text-zinc-500 truncate flex-1">{p.reason}</span>
                <button onClick={() => remove(p.id)} className="text-[10px] text-rose-400 hover:text-rose-300">✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
