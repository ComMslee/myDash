'use client';

import { useEffect, useState } from 'react';

// 지오펜스 read-only 패널 — TeslaMate `geofences` 테이블 직조회.
// 이름 패턴으로 집/회사/커스텀 자동 분류. 추가·삭제는 TeslaMate UI 에서.

const KIND_LABEL = { home: '집', work: '회사', custom: '커스텀' };
const KIND_COLOR = {
  home: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  work: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  custom: 'text-zinc-400 bg-zinc-800 border-white/[0.06]',
};

export default function GeofencesPanel() {
  const [items, setItems] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/geofences')
      .then((r) => r.json())
      .then((j) => { if (alive) setItems(j.geofences || []); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, []);

  const home = items?.find((g) => g.kind === 'home');
  const work = items?.find((g) => g.kind === 'work');
  const customs = items?.filter((g) => g.kind === 'custom') || [];

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500 font-semibold tracking-wide">지오펜스 (TeslaMate)</p>
        <p className="text-[10px] text-zinc-600">단일 진실원 · 추가·삭제는 TeslaMate UI</p>
      </div>

      {!items && <p className="text-[10px] text-zinc-600 py-2 text-center">로딩…</p>}

      {items && items.length === 0 && (
        <div className="text-[11px] text-zinc-500 py-3 text-center space-y-1">
          <p>등록된 지오펜스가 없습니다.</p>
          <p className="text-zinc-600">TeslaMate 에서 "Geo-Fences" 메뉴 → 집·회사 추가</p>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="space-y-1">
          <Row label="집" g={home} kind="home" />
          <Row label="회사" g={work} kind="work" />
          {customs.map((g) => (
            <Row key={g.id} label={g.name} g={g} kind="custom" />
          ))}
        </div>
      )}

      <p className="text-[10px] text-zinc-600 pt-1 border-t border-white/[0.04]">
        이름 패턴 자동 분류 — <span className="text-zinc-400">'집'/'home'</span> → 집, <span className="text-zinc-400">'회사'/'work'/'office'</span> → 회사, 그 외 → 커스텀
      </p>
    </div>
  );
}

function Row({ label, g, kind }) {
  const cls = KIND_COLOR[kind];
  if (!g) {
    return (
      <div className={`flex items-center gap-2 px-2 py-1.5 rounded border border-dashed ${kind === 'home' ? 'border-emerald-500/15' : kind === 'work' ? 'border-sky-500/15' : 'border-white/[0.04]'} text-[11px] text-zinc-600`}>
        <span className="w-12 font-semibold">{label}</span>
        <span className="flex-1">미설정 — TeslaMate 에서 이름에 "{kind === 'home' ? '집/home' : '회사/work'}" 포함하여 추가</span>
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded border ${cls}`}>
      <span className={`text-xs font-semibold w-12 flex-shrink-0`}>{KIND_LABEL[kind]}</span>
      <span className="text-xs text-zinc-300 truncate">{g.name}</span>
      <span className="text-[10px] text-zinc-500 tabular-nums truncate ml-auto flex-shrink-0">{g.lat.toFixed(5)}, {g.lng.toFixed(5)} · {g.radius_m}m</span>
    </div>
  );
}
