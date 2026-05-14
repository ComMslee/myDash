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
  { key: 'checklist', label: '🔧 체크리스트' },
];

export default function SettingsSheet({ open, onClose, onRunNow, onAfterRun }) {
  const [sec, setSec] = useState('now');
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-[#0f0f0f] border border-white/[0.10] rounded-2xl p-5 space-y-4"
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
        {sec === 'checklist' && (
          <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-3 text-[11px] text-zinc-500 space-y-1.5">
            <p className="font-semibold text-zinc-400 text-xs">실연동 체크리스트</p>
            <p>• 기상청 API 키 → 환경변수 <span className="text-zinc-300">KMA_API_KEY</span></p>
            <p>• Tesla Developer 앱 등록 → <span className="text-zinc-300">TESLA_FLEET_CLIENT_ID / _SECRET</span></p>
            <p>• OAuth + Virtual Key 페어링 → access token</p>
            <p>• <span className="text-zinc-300">TESLA_FLEET_API_ENABLED=true</span> 환경변수 토글</p>
            <p>• 결제수단 미등록 권장 — $10 한도 초과 시 자동 차단 (청구 X)</p>
            <p>• 지오펜스(집/회사) — TeslaMate UI 에서 추가/삭제 (단일 진실원)</p>
          </div>
        )}
      </div>
    </div>
  );
}
