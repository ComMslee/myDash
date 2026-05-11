'use client';

import { useState } from 'react';

const ICON = {
  prev: <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>,
  play: <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>,
  pause: <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>,
  next: <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>,
  heartFilled: <svg viewBox="0 0 24 24" className="w-6 h-6" fill="#1DB954"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>,
  heartEmpty: <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>,
};

async function postJson(url, body) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
    cache: 'no-store',
  });
  return resp;
}

export default function PlaybackControls({ state, onAfterAction }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function act(action) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const resp = await postJson('/api/spotify/control', { action });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        // 403/404: 활성 디바이스 없거나 Free 계정 — 친화적 안내
        if (resp.status === 403) setError('재생 제어는 Premium 만 가능');
        else if (resp.status === 404) setError('활성 디바이스 없음 — 차량 또는 Spotify 앱 켜기');
        else setError(`실패 (${resp.status})`);
        return;
      }
      // 짧게 기다린 뒤 새로고침 (Spotify 가 상태 반영하는 데 ~300ms)
      setTimeout(() => onAfterAction?.(), 300);
    } finally {
      setBusy(false);
    }
  }

  async function toggleFav() {
    if (busy || !state.trackId) return;
    setBusy(true);
    setError(null);
    try {
      const resp = await postJson('/api/spotify/favorite', {
        trackId: state.trackId,
        currently: !!state.isFavorite,
      });
      if (!resp.ok) {
        setError(`즐겨찾기 실패 (${resp.status})`);
        return;
      }
      setTimeout(() => onAfterAction?.(), 100);
    } finally {
      setBusy(false);
    }
  }

  const playing = !!state.isPlaying;

  return (
    <div className="rounded-xl bg-[#161618] p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => act('previous')}
            disabled={busy}
            className="p-2 rounded-full text-zinc-300 hover:text-white hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
            aria-label="이전 곡"
          >{ICON.prev}</button>
          <button
            type="button"
            onClick={() => act(playing ? 'pause' : 'play')}
            disabled={busy}
            className="p-2.5 rounded-full bg-green-500 text-black hover:bg-green-400 disabled:opacity-40 transition-colors"
            aria-label={playing ? '일시정지' : '재생'}
          >{playing ? ICON.pause : ICON.play}</button>
          <button
            type="button"
            onClick={() => act('next')}
            disabled={busy}
            className="p-2 rounded-full text-zinc-300 hover:text-white hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
            aria-label="다음 곡"
          >{ICON.next}</button>
        </div>

        <button
          type="button"
          onClick={toggleFav}
          disabled={busy || !state.trackId}
          className="p-2 rounded-full hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
          aria-label={state.isFavorite ? '좋아요 해제' : '좋아요'}
          aria-pressed={state.isFavorite}
        >
          {state.isFavorite ? ICON.heartFilled : <span className="text-zinc-400">{ICON.heartEmpty}</span>}
        </button>
      </div>
      {error && <p className="text-[11px] text-red-400 text-center mt-1">{error}</p>}
    </div>
  );
}
