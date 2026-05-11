'use client';

import { useState } from 'react';
import useSpotifyPolling from './useSpotifyPolling';
import SpotifyPlayer from './SpotifyPlayer';
import PlaybackControls from './PlaybackControls';
import RecentList from './RecentList';
import QueueList from './QueueList';

export default function SpotifyPage() {
  const state = useSpotifyPolling(5000);
  const [openList, setOpenList] = useState(null); // 'recent' | 'queue' | null

  async function seek(positionMs) {
    await fetch('/api/spotify/seek', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positionMs }),
      cache: 'no-store',
    });
    setTimeout(() => state.refresh?.(), 200);
  }

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-zinc-100">
      <div className="max-w-2xl mx-auto px-3 pt-4 pb-24 flex flex-col gap-3">
        <header className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <span className="text-green-500">🎵</span>
            <span>Spotify</span>
          </h1>
          {state.loading && (
            <span className="text-[11px] text-zinc-500">로딩 중...</span>
          )}
        </header>

        {/* 인증 에러 */}
        {state.error === 'auth' && (
          <div className="rounded-xl bg-red-500/10 ring-1 ring-red-500/30 p-4 text-sm text-red-300">
            인증 필요 — 로그인 후 다시 시도하세요.
          </div>
        )}

        {/* 재생 중인 곡 없음 */}
        {!state.loading && state.error !== 'auth' && !state.playing && (
          <div className="rounded-xl bg-[#161618] p-6 text-center">
            <div className="text-4xl mb-2">🎶</div>
            <div className="text-sm text-zinc-400">재생 중인 곡 없음</div>
            <div className="text-[11px] text-zinc-600 mt-1">차량 또는 Spotify 앱에서 재생을 시작하세요</div>
          </div>
        )}

        {/* 플레이어 + 컨트롤 */}
        {state.playing && (
          <>
            <SpotifyPlayer state={state} onSeek={seek} />
            <PlaybackControls state={state} onAfterAction={state.refresh} />
          </>
        )}

        {/* 리스트 토글 */}
        {state.error !== 'auth' && (
          <div className="rounded-xl bg-[#161618] overflow-hidden">
            <div className="flex">
              <button
                type="button"
                onClick={() => setOpenList(openList === 'recent' ? null : 'recent')}
                className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                  openList === 'recent' ? 'bg-white/[0.06] text-zinc-100' : 'text-zinc-400 hover:bg-white/[0.04]'
                }`}
              >
                ⏮  최근 재생
              </button>
              <div className="w-px bg-white/[0.06]" />
              <button
                type="button"
                onClick={() => setOpenList(openList === 'queue' ? null : 'queue')}
                className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                  openList === 'queue' ? 'bg-white/[0.06] text-zinc-100' : 'text-zinc-400 hover:bg-white/[0.04]'
                }`}
              >
                ⏭  다음 대기열
              </button>
            </div>
            <RecentList open={openList === 'recent'} onAfterFavorite={state.refresh} />
            <QueueList open={openList === 'queue'} onAfterPlay={state.refresh} />
          </div>
        )}
      </div>
    </main>
  );
}
