'use client';
import { useState, useEffect, useCallback } from 'react';

const ID_OFFSET = 95110; // chgerId + 95110 = 차지비 앱 ID
const FAVORITE_IDS_ORDERED = ['04', '05', '12', '13']; // 앱 번호 14, 15, 22, 23
const FAVORITE_IDS = new Set(FAVORITE_IDS_ORDERED);

const STAT_META = {
  '2': { label: '대기',     dot: 'bg-emerald-500', text: 'text-emerald-400', cellBg: 'bg-emerald-500/80', cellText: 'text-white' },
  '3': { label: '충전중',   dot: 'bg-blue-500',    text: 'text-blue-400',    cellBg: 'bg-blue-500/80',    cellText: 'text-white' },
  '4': { label: '운영중지', dot: 'bg-zinc-600',    text: 'text-zinc-400',    cellBg: 'bg-zinc-700/70',    cellText: 'text-zinc-300' },
  '5': { label: '점검중',   dot: 'bg-amber-500',   text: 'text-amber-400',   cellBg: 'bg-amber-500/80',   cellText: 'text-white' },
  '1': { label: '통신이상', dot: 'bg-rose-500',    text: 'text-rose-400',    cellBg: 'bg-rose-500/80',    cellText: 'text-white' },
  '9': { label: '확인불가', dot: 'bg-zinc-700',    text: 'text-zinc-500',    cellBg: 'bg-zinc-800',       cellText: 'text-zinc-500' },
};

function timeAgoKo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 10) return '방금';
  if (s < 60) return `${s}초 전`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export default function HomeChargerCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0); // relative-time re-render

  const load = useCallback(async (force = false) => {
    try {
      if (force) setRefreshing(true);
      const res = await fetch(`/api/home-charger${force ? '?refresh=1' : ''}`);
      const d = await res.json();
      if (d.error) setError(d.error);
      else { setData(d); setError(null); }
    } catch (e) {
      setError(e.message || '조회 실패');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    const poll = setInterval(() => load(false), 60_000);
    const clock = setInterval(() => setTick(t => t + 1), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [load]);

  if (loading) {
    return (
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl flex items-center justify-center py-10">
        <div className="w-5 h-5 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-3 text-xs text-zinc-500">
        집충전기 정보를 불러오지 못했습니다{error ? ` — ${error}` : ''}.
      </div>
    );
  }

  const { station, chargers, fetchedAt } = data;
  const counts = chargers.reduce((acc, c) => {
    acc[c.stat] = (acc[c.stat] || 0) + 1;
    return acc;
  }, {});
  void tick; // keep dependency for relative time re-render

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-widest uppercase text-zinc-500">집충전기</span>
        <span className="text-[11px] text-zinc-500">{station.useTime}</span>
      </div>

      <div className="px-4 py-3">
        <div className="mb-3">
          <div className="text-[15px] font-semibold text-white">{station.statNm}</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">{station.addr}</div>
        </div>

        {(() => {
          const byId = new Map(chargers.map(c => [c.chgerId, c]));
          const mainGroup = chargers.filter(c => !FAVORITE_IDS.has(c.chgerId));
          const renderCell = (c, size = 'md') => {
            const meta = STAT_META[c.stat] || STAT_META['9'];
            const localId = ID_OFFSET + Number(c.chgerId);
            const label = localId - 95100;
            const sizeClass = size === 'lg'
              ? 'w-10 h-10 text-sm'
              : 'aspect-square text-[10px]';
            return (
              <div
                key={c.chgerId}
                className={`${sizeClass} rounded-md flex items-center justify-center font-bold tabular-nums ${meta.cellBg} ${meta.cellText}`}
                title={`${localId} · ${meta.label}`}
              >
                {label}
              </div>
            );
          };
          return (
            <div className="mb-3 space-y-2">
              {(() => {
                const favChargers = FAVORITE_IDS_ORDERED.map(id => byId.get(id)).filter(Boolean);
                if (!favChargers.length) return null;
                return (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-600 mr-0.5 w-10 shrink-0">자주</span>
                    {favChargers.map(c => renderCell(c, 'lg'))}
                  </div>
                );
              })()}
              <div className="grid grid-cols-12 gap-1 pt-1">
                {mainGroup.map(c => renderCell(c, 'md'))}
              </div>
            </div>
          );
        })()}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums">
          <span className="text-zinc-400">총 {chargers.length}기</span>
          {['2', '3', '5', '1', '4', '9'].map(k => {
            const n = counts[k];
            if (!n) return null;
            const meta = STAT_META[k];
            return (
              <span key={k} className={`flex items-center gap-1 ${meta.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                {meta.label} {n}
              </span>
            );
          })}
          <span className="ml-auto flex items-center gap-1.5 text-zinc-500">
            {fetchedAt && <span>갱신 {timeAgoKo(fetchedAt)}</span>}
            <button
              type="button"
              onClick={() => load(true)}
              disabled={refreshing}
              aria-label="지금 갱신"
              className="w-6 h-6 rounded-md hover:bg-white/[0.06] active:bg-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
            >
              <svg
                viewBox="0 0 20 20"
                className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 10a7 7 0 0 1 12-4.95L17 7" />
                <path d="M17 3v4h-4" />
                <path d="M17 10a7 7 0 0 1-12 4.95L3 13" />
                <path d="M3 17v-4h4" />
              </svg>
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
