'use client';

import { useEffect, useState } from 'react';

export default function QueueList({ open, onAfterPlay }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [playingUri, setPlayingUri] = useState(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/spotify/queue', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => { if (!cancelled) setItems(data.queue || []); })
      .catch(s => { if (!cancelled) setError(`불러오기 실패 (${s})`); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  async function play(uri) {
    if (playingUri) return;
    setPlayingUri(uri);
    try {
      const resp = await fetch('/api/spotify/play-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri }),
        cache: 'no-store',
      });
      if (!resp.ok) {
        setError(`재생 실패 (${resp.status})`);
        return;
      }
      setTimeout(() => onAfterPlay?.(), 300);
    } finally {
      setPlayingUri(null);
    }
  }

  if (!open) return null;
  if (loading) return <div className="text-xs text-zinc-500 text-center py-3">불러오는 중...</div>;
  if (error) return <div className="text-xs text-red-400 text-center py-3">{error}</div>;
  if (!items.length) return <div className="text-xs text-zinc-500 text-center py-3">대기열 비어있음</div>;

  return (
    <ul className="flex flex-col">
      {items.slice(0, 20).map((t, i) => (
        <li key={t.uri + i}>
          <button
            type="button"
            onClick={() => play(t.uri)}
            disabled={!!playingUri}
            className="w-full text-left flex items-center gap-2 px-3 py-2 border-t border-white/[0.04] hover:bg-white/[0.04] active:bg-green-500/10 disabled:opacity-50 transition-colors"
          >
            <span className="text-[10px] text-zinc-600 w-4 flex-shrink-0 tabular-nums">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-zinc-200 truncate" title={t.name}>{t.name}</div>
              <div className="text-[10px] text-zinc-500 truncate" title={t.artist}>{t.artist}</div>
            </div>
            {playingUri === t.uri && (
              <span className="text-[10px] text-green-400">재생 중...</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
