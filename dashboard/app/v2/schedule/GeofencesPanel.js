'use client';

import { useEffect, useState } from 'react';

// 지오펜스 (집/회사/커스텀) 관리.
// "현재 위치를 집/회사로" 버튼은 TeslaMate positions 최신 좌표를 가져와 사용.

const KIND_LABEL = { home: '집', work: '회사', custom: '커스텀' };

export default function GeofencesPanel() {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await fetch('/api/geofences');
    const j = await r.json().catch(() => null);
    setItems(j?.geofences || []);
  };
  useEffect(() => { load(); }, []);

  const saveCurrentAs = async (kind) => {
    setBusy(true);
    try {
      // TeslaMate positions 최신 좌표 가져오기 — /api/location 사용
      const lr = await fetch('/api/location');
      const lj = await lr.json().catch(() => null);
      const lat = lj?.lat ?? lj?.latitude;
      const lng = lj?.lng ?? lj?.longitude;
      if (lat == null || lng == null) {
        alert('현재 위치 조회 실패 — 차량 좌표를 가져올 수 없습니다');
        return;
      }
      const existing = items?.find((g) => g.kind === kind);
      const body = {
        id: existing?.id,
        name: kind === 'home' ? '집' : kind === 'work' ? '회사' : '커스텀',
        kind,
        lat: Number(lat),
        lng: Number(lng),
        radius_m: existing?.radius_m || 100,
      };
      await fetch(existing ? `/api/geofences/${existing.id}` : '/api/geofences', {
        method: existing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await load();
    } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!confirm('삭제할까요?')) return;
    await fetch(`/api/geofences/${id}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500 font-semibold tracking-wide">지오펜스 (집·회사)</p>
        <p className="text-[10px] text-zinc-600">위치 자동화 기준점</p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => saveCurrentAs('home')}
          disabled={busy}
          className="flex-1 text-xs py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40"
        >🏠 현재 위치를 집으로</button>
        <button
          onClick={() => saveCurrentAs('work')}
          disabled={busy}
          className="flex-1 text-xs py-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 hover:bg-sky-500/20 disabled:opacity-40"
        >🏢 현재 위치를 회사로</button>
      </div>

      {items && items.length > 0 && (
        <div className="space-y-1">
          {items.map((g) => (
            <div key={g.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-zinc-900 border border-white/[0.04]">
              <span className="text-xs font-semibold w-12 text-zinc-300">{KIND_LABEL[g.kind] || g.name}</span>
              <span className="text-[10px] text-zinc-500 tabular-nums truncate flex-1">{g.lat.toFixed(5)}, {g.lng.toFixed(5)} · {g.radius_m}m</span>
              <button onClick={() => remove(g.id)} className="text-[10px] text-rose-400 hover:text-rose-300">✕</button>
            </div>
          ))}
        </div>
      )}

      {items && items.length === 0 && (
        <p className="text-[10px] text-zinc-600 text-center py-2">아직 등록된 위치가 없습니다</p>
      )}
    </div>
  );
}
