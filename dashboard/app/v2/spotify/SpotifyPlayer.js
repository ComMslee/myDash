'use client';

import { useEffect, useRef, useState } from 'react';
import DeviceBadge from './DeviceBadge';

function formatTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// 재생 중이면 마지막 polling 후 경과 시간을 더해서 progress 가 흘러가도록.
function useLiveProgress(serverProgressMs, durationMs, isPlaying, timestamp) {
  const [progress, setProgress] = useState(serverProgressMs || 0);
  const lastSyncRef = useRef({ progressMs: serverProgressMs || 0, timestamp: timestamp || Date.now() });

  useEffect(() => {
    lastSyncRef.current = { progressMs: serverProgressMs || 0, timestamp: timestamp || Date.now() };
    setProgress(serverProgressMs || 0);
  }, [serverProgressMs, timestamp]);

  useEffect(() => {
    if (!isPlaying || !durationMs) return;
    const id = setInterval(() => {
      const elapsed = Date.now() - lastSyncRef.current.timestamp;
      const next = lastSyncRef.current.progressMs + elapsed;
      setProgress(Math.min(next, durationMs));
    }, 500);
    return () => clearInterval(id);
  }, [isPlaying, durationMs]);

  return progress;
}

export default function SpotifyPlayer({ state, onSeek }) {
  const live = useLiveProgress(state.progressMs, state.durationMs, state.isPlaying, state.timestamp);
  const barRef = useRef(null);

  function handleSeekClick(e) {
    if (!state.durationMs || !barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const positionMs = Math.round(ratio * state.durationMs);
    onSeek?.(positionMs);
  }

  const pct = state.durationMs ? Math.min((live / state.durationMs) * 100, 100) : 0;

  return (
    <div className="rounded-xl bg-[#161618] p-4 flex flex-col gap-3">
      {/* 트랙 정보 + 디바이스 */}
      <div className="flex items-start gap-3">
        {state.albumArt ? (
          <img
            src={state.albumArt}
            alt=""
            className="w-14 h-14 rounded object-cover flex-shrink-0 bg-black/40"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-14 h-14 rounded bg-black/40 flex items-center justify-center text-zinc-700 flex-shrink-0">
            🎵
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-zinc-100 truncate" title={state.name}>{state.name}</div>
          <div className="text-xs text-zinc-400 truncate" title={state.artist}>{state.artist}</div>
          <div className="mt-1.5">
            <DeviceBadge device={state.device} />
          </div>
        </div>
      </div>

      {/* 진행률 */}
      <div>
        <div
          ref={barRef}
          onClick={handleSeekClick}
          className="relative h-1.5 bg-white/[0.06] rounded-full cursor-pointer group"
          role="slider"
          aria-valuemin={0}
          aria-valuemax={state.durationMs || 0}
          aria-valuenow={live}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-green-500 group-hover:bg-green-400 transition-colors"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-zinc-500 mt-1 tabular-nums">
          <span>{formatTime(live)}</span>
          <span>{formatTime(state.durationMs)}</span>
        </div>
      </div>
    </div>
  );
}
