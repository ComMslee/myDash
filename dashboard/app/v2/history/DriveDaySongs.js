'use client';

import { useEffect, useRef, useState } from 'react';

// 운전 일자 카드 하단에 인라인 확장 — 그날 운전 시간대에 들은 Spotify 곡 매시업.
//
// ⚠️  Spotify recently-played 50곡 캡 — 며칠 전 운전은 데이터 소실 가능.
//     cappedAt50 응답이 true 면 안내 문구 표시.
// ⚠️  디바이스 정보가 recently-played 에 없어 폰/스피커 재생도 섞일 수 있음.
//     (차량 active 디바이스 검증은 향후 spotify_plays 자체 누적 시 가능)

function fmtPlayedAt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

export default function DriveDaySongs({ dayGroup }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null); // { items, cappedAt50, oldestAvailable } | null
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fetchedRef = useRef(false);

  // 그날의 첫 출발 ~ 마지막 도착
  const visible = (dayGroup.items || []).filter(d => !d.absorbed && d.start_date);
  if (!visible.length) return null;
  const sortedAsc = [...visible].sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
  const start = sortedAsc[0].start_date;
  const last = sortedAsc[sortedAsc.length - 1];
  const end = last.end_date || last.start_date;

  // 운전이 너무 오래 전이면 (recently-played 50곡 캡 한참 이전) 매칭 가능성 ↓ — 버튼 자체는 유지
  // (사용자가 클릭해 확인 가능. 응답에 cappedAt50 안내)

  useEffect(() => {
    if (!open || fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ start, end });
    fetch(`/api/spotify/during-drive?${params}`, { cache: 'no-store' })
      .then(r => {
        if (r.status === 401 || r.status === 412) throw new Error('인증 필요');
        if (!r.ok) throw new Error(`불러오기 실패 (${r.status})`);
        return r.json();
      })
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, start, end]);

  const songCount = data?.items?.length ?? null;

  return (
    <div className="border-b border-white/[0.04] bg-black/20">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-500 hover:bg-white/[0.025] active:bg-white/[0.04] transition-colors"
        aria-expanded={open}
      >
        <span className="text-green-500/70">🎵</span>
        <span>
          {songCount === null ? '들은 곡 보기' : songCount === 0 ? '들은 곡 없음' : `${songCount}곡`}
        </span>
        {data?.cappedAt50 && (
          <span className="text-[10px] text-amber-400/70" title="Spotify 최근 50곡 캡 — 더 이전 데이터는 소실됨">
            (일부만)
          </span>
        )}
        <span className="flex-1" />
        <svg className={`w-3 h-3 transition-transform ${open ? '' : '-rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-3 pb-2">
          {loading && <div className="text-[10px] text-zinc-600 py-1">불러오는 중...</div>}
          {error && <div className="text-[10px] text-red-400 py-1">{error}</div>}
          {!loading && !error && data?.items?.length === 0 && (
            <div className="text-[10px] text-zinc-600 py-1">
              이 시간대 Spotify 재생 기록 없음
              {data.cappedAt50 && ' — 50곡 캡 이전 데이터는 소실됨'}
            </div>
          )}
          {!loading && !error && data?.items?.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {data.items.map(t => (
                <li key={t.playedAt + t.trackId} className="flex items-center gap-2 text-[11px] tabular-nums">
                  <span className="text-zinc-600 w-9 flex-shrink-0">{fmtPlayedAt(t.playedAt)}</span>
                  <span className="text-zinc-300 truncate flex-1" title={`${t.name} — ${t.artist}`}>
                    {t.name}
                  </span>
                  <span className="text-zinc-600 truncate max-w-[100px] flex-shrink-0" title={t.artist}>
                    {t.artist}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
