'use client';

import { useEffect, useState } from 'react';

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const min = Math.floor(ms / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return `${day}일 전`;
}

export default function RecentList({ open, onAfterFavorite }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/spotify/recent?limit=10', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => { if (!cancelled) setItems(data.items || []); })
      .catch(s => { if (!cancelled) setError(`불러오기 실패 (${s})`); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  async function toggleFav(trackId, currently) {
    const resp = await fetch('/api/spotify/favorite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackId, currently }),
      cache: 'no-store',
    });
    if (!resp.ok) return;
    const data = await resp.json();
    setItems(prev => prev.map(i => i.trackId === trackId ? { ...i, isFavorite: data.isFavorite } : i));
    onAfterFavorite?.();
  }

  if (!open) return null;
  if (loading) return <div className="text-xs text-zinc-500 text-center py-3">불러오는 중...</div>;
  if (error) return <div className="text-xs text-red-400 text-center py-3">{error}</div>;
  if (!items.length) return <div className="text-xs text-zinc-500 text-center py-3">최근 재생 기록 없음</div>;

  return (
    <ul className="flex flex-col">
      {items.map(t => (
        <li key={t.playedAt + t.trackId} className="flex items-center gap-2 px-3 py-2 border-t border-white/[0.04]">
          <button
            type="button"
            onClick={() => toggleFav(t.trackId, t.isFavorite)}
            className="flex-shrink-0 p-1 rounded hover:bg-white/[0.06] transition-colors"
            aria-label={t.isFavorite ? '좋아요 해제' : '좋아요'}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill={t.isFavorite ? '#1DB954' : 'none'} stroke={t.isFavorite ? '#1DB954' : '#71717a'} strokeWidth="2">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-zinc-200 truncate" title={t.name}>{t.name}</div>
            <div className="text-[10px] text-zinc-500 truncate" title={t.artist}>{t.artist}</div>
          </div>
          <span className="text-[10px] text-zinc-600 tabular-nums flex-shrink-0">{timeAgo(t.playedAt)}</span>
        </li>
      ))}
    </ul>
  );
}
