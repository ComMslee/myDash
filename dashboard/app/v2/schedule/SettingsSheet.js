'use client';

import { useState } from 'react';
import GeofencesPanel from './GeofencesPanel';
import NowPanel from './NowPanel';
import TeslaConnectPanel from './TeslaConnectPanel';

// 설정 시트 — 드물게 쓰는 것만: 즉시 실행 / 지오펜스 / Tesla 연결 / 체크리스트.
// 휴무·전체 스케줄·전체 이력은 메인 인라인으로 이동했음.

const SECTIONS = [
  { key: 'now',       label: '⚡ 즉시 실행' },
  { key: 'geofences', label: '📍 지오펜스' },
  { key: 'tesla',     label: '🔌 Tesla 연결' },
];

export default function SettingsSheet({ open, onClose, onRunNow, onAfterRun }) {
  const [sec, setSec] = useState('now');
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-start justify-center sm:items-center p-2 sm:p-3 overflow-y-auto" onClick={onClose}>
      <div
        className="w-full max-w-md sm:max-w-2xl my-2 sm:my-0 max-h-[92vh] overflow-y-auto bg-[#0f0f0f] border border-white/[0.10] rounded-2xl p-4 sm:p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-zinc-100">설정</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center">✕</button>
        </div>

        <div className="flex items-center gap-1 bg-zinc-900 border border-white/[0.06] rounded-xl p-1 overflow-x-auto">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSec(s.key)}
              className={`text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-colors flex-shrink-0 ${
                sec === s.key ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >{s.label}</button>
          ))}
        </div>

        {sec === 'now' && <NowPanel onAfterRun={onAfterRun} />}
        {sec === 'geofences' && <GeofencesPanel />}
        {sec === 'tesla' && <TeslaConnectPanel />}
      </div>
    </div>
  );
}
