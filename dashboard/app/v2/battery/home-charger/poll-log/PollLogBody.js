'use client';
import { useEffect, useState } from 'react';
import { kstDateStr, KST_OFFSET_MS } from '@/lib/kst';
import { WarmDiagCard } from './diag';
import { MetricHeatmap5Row, DailyFailureHeatmap } from './heatmap';
import { TabButton, SummaryCard, HourlyTable, DailyTable } from './ui';

// PollLogPopup 의 본문 — 모달/시트 래퍼 없이 데이터+UI 만.
// 두 곳에서 재사용: 기존 PollLogPopup, 신규 PeekSheet 의 chargers 확장 본문.
export default function PollLogBody() {
  const [view, setView] = useState('hourly'); // 'hourly' | 'daily'
  const [mode, setMode] = useState('heatmap'); // 'heatmap' | 'table'
  const [offset, setOffset] = useState(0);
  const [days, setDays] = useState(14);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        let url;
        if (view === 'daily') {
          url = `/api/home-charger/poll-log?view=daily&days=${days}`;
        } else {
          const dateStr = kstDateStr(Date.now(), offset);
          url = `/api/home-charger/poll-log?date=${dateStr}`;
        }
        const res = await fetch(url, { cache: 'no-store' });
        const d = await res.json();
        if (!alive) return;
        if (d.error) setError(d.error);
        else setData(d);
      } catch (e) {
        if (alive) setError(e.message || '조회 실패');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [view, offset, days]);

  const nowHour = new Date(Date.now() + KST_OFFSET_MS).getUTCHours();
  const isToday = offset === 0;
  const todayStr = kstDateStr(Date.now());

  return (
    <div className="px-4 py-2.5 space-y-3">
      {data?.warmDiag && <WarmDiagCard diag={data.warmDiag} />}

      <div className="flex gap-1 bg-[#1a1a1c] border border-white/[0.06] rounded-md p-0.5">
        <TabButton active={view === 'hourly'} onClick={() => setView('hourly')}>시간별</TabButton>
        <TabButton active={view === 'daily'} onClick={() => setView('daily')}>일별</TabButton>
      </div>

      {view === 'hourly' ? (
        <div className="flex items-center justify-between text-[12px]">
          <button
            type="button"
            onClick={() => setOffset(o => o - 1)}
            className="px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300"
          >
            ◀ 이전
          </button>
          <span className="tabular-nums text-zinc-200 font-semibold">
            {data?.date || '-'}{isToday ? ' (오늘)' : ''}
          </span>
          <button
            type="button"
            onClick={() => setOffset(o => Math.min(0, o + 1))}
            disabled={offset >= 0}
            className="px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 disabled:opacity-30"
          >
            다음 ▶
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-zinc-500">최근</span>
          <div className="flex gap-1">
            {[7, 14, 30].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setDays(n)}
                className={`px-2 py-1 rounded text-[11px] ${
                  days === n ? 'bg-white/[0.08] text-zinc-100' : 'bg-white/[0.04] text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {n}일
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-6">
          <div className="w-5 h-5 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
        </div>
      )}
      {error && <div className="text-[12px] text-rose-400">조회 실패 — {error}</div>}

      {!loading && !error && data && (
        <>
          <SummaryCard totals={data.totals || {}} lastQuotaHitAt={data.lastQuotaHitAt || 0} />

          <div className="flex items-center justify-between gap-2">
            {view === 'hourly' && mode === 'heatmap' && data.ttlInfo ? (
              <div className="text-[10px] text-zinc-500 tabular-nums">
                현재 TTL: <span className="text-zinc-300 font-semibold">{data.ttlInfo.currentMin}분</span>
                <span className="text-zinc-600 ml-1">({data.ttlInfo.currentHour}시)</span>
              </div>
            ) : (<span />)}
            <div className="flex gap-0.5 bg-[#1a1a1c] border border-white/[0.06] rounded p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setMode('heatmap')}
                className={`px-2 py-0.5 text-[10px] rounded ${mode === 'heatmap' ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
              >히트맵</button>
              <button
                type="button"
                onClick={() => setMode('table')}
                className={`px-2 py-0.5 text-[10px] rounded ${mode === 'table' ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
              >표</button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {view === 'hourly' ? (
              mode === 'heatmap' ? (
                <MetricHeatmap5Row hourly={data.hourly || []} />
              ) : (
                <HourlyTable
                  rows={data.hourly || []}
                  schedule={data.ttlInfo?.schedule}
                  nowHour={nowHour}
                  isToday={isToday}
                />
              )
            ) : (
              mode === 'heatmap' ? (
                <DailyFailureHeatmap
                  dailyByHour={data.dailyByHour || []}
                  daily={data.daily || []}
                  todayStr={todayStr}
                />
              ) : (
                <DailyTable rows={data.daily || []} todayStr={todayStr} />
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}
