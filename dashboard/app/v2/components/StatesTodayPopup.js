'use client';

import { useEffect, useState } from 'react';

const STATE_STYLE = {
  online: { cls: 'bg-emerald-500/15 text-emerald-300', label: '온라인' },
  driving: { cls: 'bg-blue-500/15 text-blue-300', label: '주행' },
  charging: { cls: 'bg-yellow-500/15 text-yellow-300', label: '충전' },
  asleep: { cls: 'bg-zinc-700/40 text-zinc-400', label: '슬립' },
  offline: { cls: 'bg-rose-500/15 text-rose-300', label: '오프라인' },
  unknown: { cls: 'bg-zinc-700/40 text-zinc-400', label: '알 수 없음' },
};

function fmtTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtDuration(min) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function StatesTodayPopup({ open, onClose }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!open) return;
    setData(null);
    fetch('/api/states-today')
      .then(r => r.json())
      .then(j => setData(j.segments || []))
      .catch(() => setData([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const wakeSegs = (data || []).filter(s => ['online', 'driving', 'charging'].includes(s.state));
  const briefWakes = wakeSegs.filter(s => s.state === 'online' && s.minutes < 10);
  const totalOnlineMin = wakeSegs.filter(s => s.state === 'online').reduce((t, s) => t + s.minutes, 0);

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="오늘 차량 상태 타임라인"
    >
      <div
        className="w-full max-w-md bg-[#0f0f0f] border border-white/[0.08] rounded-2xl shadow-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-zinc-200">오늘 차량 상태</h2>
            <p className="text-[10px] text-zinc-500 mt-0.5">
              TeslaMate states · 짧게 깬 구간 {briefWakes.length}건 · 총 온라인 {fmtDuration(totalOnlineMin)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 p-1"
            aria-label="닫기"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-2">
          {!data ? (
            <p className="text-xs text-zinc-500 text-center py-6">로딩…</p>
          ) : data.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-6">오늘 기록이 없습니다</p>
          ) : (
            <div className="space-y-1">
              {[...data].reverse().map((s, i) => {
                const st = STATE_STYLE[s.state] || STATE_STYLE.unknown;
                const isBrief = s.state === 'online' && s.minutes < 10;
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs ${isBrief ? 'bg-amber-500/[0.06] border border-amber-500/20' : ''}`}
                  >
                    <span className="text-[10px] text-zinc-500 tabular-nums w-20 flex-shrink-0">
                      {fmtTime(s.start)}–{s.is_current ? '지금' : fmtTime(s.end)}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${st.cls} flex-shrink-0`}>
                      {st.label}
                    </span>
                    <span className="text-zinc-400 tabular-nums ml-auto flex-shrink-0">
                      {fmtDuration(s.minutes)}
                    </span>
                    {isBrief && <span className="text-[10px] text-amber-400 flex-shrink-0">⚡깸</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
