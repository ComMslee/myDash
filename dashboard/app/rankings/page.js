'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { formatDuration, shortAddr, formatKorDateTime, formatKorDay } from '@/lib/format';

const TYPE_LABELS = {
  drive_distance:  { title: '최장거리 (단일 주행)',  unit: 'km',   color: 'text-blue-400' },
  drive_duration:  { title: '최장시간 (단일 주행)',  unit: '',     color: 'text-zinc-200' },
  drive_avg_speed: { title: '평균속도 (단일 주행)',  unit: 'km/h', color: 'text-amber-400' },
  day_distance:    { title: '최장거리 (일간 합계)',  unit: 'km',   color: 'text-blue-400' },
  day_duration:    { title: '최장시간 (일간 합계)',  unit: '',     color: 'text-zinc-200' },
};

function RankingsInner() {
  const params = useSearchParams();
  const type = params.get('type') || 'drive_distance';
  const meta = TYPE_LABELS[type] || TYPE_LABELS.drive_distance;

  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setItems(null);
    setError(null);
    fetch(`/api/rankings?type=${type}&limit=50`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setItems(d.items || []);
      })
      .catch(() => setError('데이터를 불러오지 못했습니다'));
  }, [type]);

  const isDrive = type.startsWith('drive_');
  const isDay = type.startsWith('day_');
  const isDistance = type === 'drive_distance' || type === 'day_distance';
  const isSpeed = type === 'drive_avg_speed';

  // 지표 탭 — 단일 주행은 3종(거리/시간/속도), 일 합계는 2종(거리/시간)
  const metricTabs = isDrive
    ? [
        { key: 'drive_distance',  label: '거리' },
        { key: 'drive_duration',  label: '시간' },
        { key: 'drive_avg_speed', label: '속도' },
      ]
    : [
        { key: 'day_distance', label: '거리' },
        { key: 'day_duration', label: '시간' },
      ];

  // 기준 탭 — 속도 지표는 "단일 주행"만 존재하므로 "일 합계" 비활성
  const baseSingleKey = isSpeed
    ? 'drive_avg_speed'
    : (isDistance ? 'drive_distance' : 'drive_duration');
  const baseDayKey = isDistance ? 'day_distance' : (type === 'drive_duration' || type === 'day_duration' ? 'day_duration' : 'day_distance');

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 py-4 pb-20">
        {/* 헤더 */}
        <div className="flex items-center gap-2 mb-4">
          <Link href="/drives" className="w-9 h-9 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-base font-bold text-zinc-200">{meta.title}</h1>
        </div>

        {/* 지표 탭 */}
        <div className={`grid gap-1.5 mb-4 ${metricTabs.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {metricTabs.map(t => (
            <Link
              key={t.key}
              href={`/rankings?type=${t.key}`}
              className={`py-2 text-center rounded-lg text-sm font-semibold transition-colors ${
                type === t.key
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'bg-zinc-800/60 text-zinc-500 border border-white/[0.06] hover:text-zinc-300'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {/* 기준 탭 — 속도일 땐 단일 주행만 */}
        <div className="grid grid-cols-2 gap-1.5 mb-5">
          <Link
            href={`/rankings?type=${baseSingleKey}`}
            className={`py-1.5 text-center rounded-lg text-xs font-semibold transition-colors ${
              isDrive ? 'bg-zinc-700/70 text-zinc-100' : 'bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            단일 주행
          </Link>
          {isSpeed ? (
            <span className="py-1.5 text-center rounded-lg text-xs font-semibold bg-zinc-900/40 text-zinc-700 border border-white/[0.03] cursor-not-allowed">
              일 합계 <span className="text-[10px]">(미지원)</span>
            </span>
          ) : (
            <Link
              href={`/rankings?type=${baseDayKey}`}
              className={`py-1.5 text-center rounded-lg text-xs font-semibold transition-colors ${
                isDay ? 'bg-zinc-700/70 text-zinc-100' : 'bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              일 합계
            </Link>
          )}
        </div>

        {/* 리스트 */}
        {error ? (
          <div className="py-16 text-center text-red-400 text-sm">{error}</div>
        ) : items === null ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-zinc-600 text-sm">기록이 없습니다</div>
        ) : (
          <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
            {items.map((it, idx) => {
              const rankColor = idx < 3 ? 'text-amber-400' : 'text-zinc-600';

              if (isDrive) {
                return (
                  <Link
                    key={it.id}
                    href={`/roadtrips?id=${it.id}`}
                    className="grid grid-cols-[28px_1fr_auto] items-center gap-2 px-4 py-3 border-b border-white/[0.05] last:border-0 hover:bg-white/[0.03] transition-colors"
                  >
                    <span className={`text-sm font-black tabular-nums text-center ${rankColor}`}>{idx + 1}</span>
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-500 tabular-nums">{formatKorDateTime(it.start_date)}</p>
                      <p className="text-sm text-zinc-300 truncate">
                        {shortAddr(it.start_address) || '?'}
                        <span className="text-zinc-600 mx-1">→</span>
                        {shortAddr(it.end_address) || '?'}
                      </p>
                    </div>
                    <div className="text-right tabular-nums">
                      {isSpeed ? (
                        <>
                          <p className={`text-base font-bold ${meta.color}`}>
                            {it.avg_speed ?? '—'}<span className="text-xs font-medium text-zinc-600 ml-0.5">km/h</span>
                          </p>
                          {it.distance > 0 && (
                            <p className="text-xs text-blue-400/80">
                              {it.distance}<span className="text-zinc-600 ml-0.5">km</span>
                              {it.duration_min && <span className="text-zinc-600 ml-1">· {formatDuration(it.duration_min)}</span>}
                            </p>
                          )}
                        </>
                      ) : isDistance ? (
                        <>
                          <p className={`text-base font-bold ${meta.color}`}>
                            {it.distance}<span className="text-xs font-medium text-zinc-600 ml-0.5">km</span>
                          </p>
                          {it.duration_min && (
                            <p className="text-xs text-zinc-500">{formatDuration(it.duration_min)}</p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className={`text-sm font-bold ${meta.color}`}>
                            {formatDuration(it.duration_min)}
                          </p>
                          {it.distance > 0 && (
                            <p className="text-xs text-blue-400/80">
                              {it.distance}<span className="text-zinc-600 ml-0.5">km</span>
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </Link>
                );
              }

              // day_* — 단일 주행과 UI 통일, 해당 날짜로 로드트립 이동
              return (
                <Link
                  key={it.day}
                  href={`/roadtrips?date=${it.day}`}
                  className="grid grid-cols-[28px_1fr_auto] items-center gap-2 px-4 py-3 border-b border-white/[0.05] last:border-0 hover:bg-white/[0.03] transition-colors"
                >
                  <span className={`text-sm font-black tabular-nums text-center ${rankColor}`}>{idx + 1}</span>
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-500 tabular-nums">{formatKorDay(it.day)}</p>
                    <p className="text-sm text-zinc-300">{it.drive_count}회 주행</p>
                  </div>
                  <div className="text-right tabular-nums">
                    {isDistance ? (
                      <>
                        <p className={`text-base font-bold ${meta.color}`}>
                          {it.total_distance}<span className="text-xs font-medium text-zinc-600 ml-0.5">km</span>
                        </p>
                        {it.total_duration > 0 && (
                          <p className="text-xs text-zinc-500">{formatDuration(it.total_duration)}</p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className={`text-sm font-bold ${meta.color}`}>
                          {formatDuration(it.total_duration)}
                        </p>
                        {it.total_distance > 0 && (
                          <p className="text-xs text-blue-400/80">
                            {it.total_distance}<span className="text-zinc-600 ml-0.5">km</span>
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

export default function RankingsPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
      </main>
    }>
      <RankingsInner />
    </Suspense>
  );
}
