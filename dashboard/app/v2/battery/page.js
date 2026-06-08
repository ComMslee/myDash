'use client';

import { useState, useEffect, useCallback } from 'react';
import RangeMapCard from '@/app/v2/battery/RangeMapCard';
import HealthScoreCard from '@/app/v2/battery/HealthScoreCard';
import IdleDrainCard from '@/app/v2/battery/IdleDrainCard';
import MonthlyChargeCard from '@/app/v2/battery/MonthlyChargeCard';
import FastChargeCard from '@/app/v2/battery/FastChargeCard';
import SlowChargeCard from '@/app/v2/battery/SlowChargeCard';
import ChargingLocationsCard from '@/app/v2/battery/ChargingLocationsCard';
import { Spinner } from '@/app/components/PageLayout';
import { formatHours } from '@/lib/format';

export default function V2BatteryPage() {
  const [data, setData] = useState(null);
  const [trend, setTrend] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // idle-drain 요약 — 즉시 표시
  const [idleSummary, setIdleSummary] = useState(null);
  // idle-drain 상세 records — 펼칠 때 로드
  const [idleRecords, setIdleRecords] = useState([]);
  const [idleCharging, setIdleCharging] = useState([]);
  const [idleHasMore, setIdleHasMore] = useState(false);
  const [idleDetailState, setIdleDetailState] = useState('idle');
  const [idleLoadingMore, setIdleLoadingMore] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/battery?summary=1').then(r => r.json()),
      fetch('/api/battery-trend').then(r => r.json()),
    ])
      .then(([batteryData, trendData]) => {
        if (batteryData.error) throw new Error(batteryData.error);
        setData(batteryData);
        setTrend(trendData.error ? null : trendData);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message || '데이터를 불러오지 못했습니다.');
        setLoading(false);
      });

    fetch('/api/idle-drain?summary=1')
      .then(r => r.json())
      .then(d => setIdleSummary(d))
      .catch(() => null);
  }, []);

  const loadIdleDetail = useCallback(() => {
    if (idleDetailState !== 'idle') return;
    setIdleDetailState('loading');
    fetch('/api/idle-drain')
      .then(r => r.json())
      .then(d => {
        setIdleRecords(d.idle_drain || []);
        setIdleCharging(d.charging_sessions || []);
        setIdleHasMore(d.has_more || false);
        setIdleDetailState('loaded');
      })
      .catch(() => setIdleDetailState('error'));
  }, [idleDetailState]);

  const loadIdleMore = useCallback(() => {
    if (idleLoadingMore) return;
    setIdleLoadingMore(true);
    fetch(`/api/idle-drain?offset=${idleRecords.length}`)
      .then(r => r.json())
      .then(d => {
        setIdleRecords(prev => [...prev, ...(d.idle_drain || [])]);
        setIdleHasMore(d.has_more || false);
        setIdleLoadingMore(false);
      })
      .catch(() => setIdleLoadingMore(false));
  }, [idleRecords.length, idleLoadingMore]);

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 py-4 pb-3 flex flex-col gap-3">
        {loading ? (
          <Spinner />
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        ) : data ? (
          <>
            <RangeMapCard />
            <HealthScoreCard data={data.health} trend={trend} />

            {/* IdleDrainCard — 요약 즉시표시, 기록은 펼칠 때 로드 */}
            <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
              {/* 요약 헤더 — 항상 표시 */}
              <div className="grid grid-cols-2 border-b border-white/[0.06]">
                <div className="text-center py-2 border-r border-white/[0.06]">
                  <div className="text-[10px] text-zinc-600 mb-1">일평균 손실</div>
                  {idleSummary ? (
                    <div className="text-sm font-extrabold tabular-nums text-amber-400">
                      {idleSummary.avg_drain_per_day}<span className="text-[9px] font-normal text-zinc-600 ml-0.5">%/일</span>
                    </div>
                  ) : (
                    <div className="w-12 h-4 bg-white/[0.06] rounded animate-pulse mx-auto" />
                  )}
                </div>
                <div className="text-center py-2">
                  <div className="text-[10px] text-zinc-600 mb-1">평균 대기</div>
                  {idleSummary ? (
                    <>
                      <div className="text-sm font-extrabold tabular-nums text-zinc-300">{formatHours(idleSummary.avg_idle_hours)}</div>
                      <div className="text-[9px] text-zinc-600 mt-0.5">{idleSummary.total_count}회 기준</div>
                    </>
                  ) : (
                    <div className="w-12 h-4 bg-white/[0.06] rounded animate-pulse mx-auto" />
                  )}
                </div>
              </div>

              {/* 상세 기록 */}
              {idleDetailState === 'loaded' ? (
                <>
                  <IdleDrainCard records={idleRecords} chargingSessions={idleCharging} hideSummary />
                  {idleHasMore && (
                    <div className="border-t border-white/[0.06] px-4 py-2">
                      <button
                        onClick={loadIdleMore}
                        disabled={idleLoadingMore}
                        className="w-full flex items-center justify-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors py-1 disabled:opacity-50"
                      >
                        {idleLoadingMore
                          ? <span className="w-3 h-3 border border-zinc-500 border-t-transparent rounded-full animate-spin" />
                          : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        }
                        {idleLoadingMore ? '로딩 중...' : '더 보기'}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="px-4 py-3">
                  <button
                    onClick={loadIdleDetail}
                    disabled={idleDetailState === 'loading'}
                    className="w-full flex items-center justify-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors py-1 disabled:opacity-50"
                  >
                    {idleDetailState === 'loading'
                      ? <span className="w-3 h-3 border border-zinc-500 border-t-transparent rounded-full animate-spin" />
                      : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    }
                    {idleDetailState === 'loading' ? '로딩 중...' : idleDetailState === 'error' ? '다시 시도' : '주간 기록 불러오기'}
                  </button>
                </div>
              )}
            </div>

            <MonthlyChargeCard />
            <ChargingLocationsCard />
            <FastChargeCard />
            <SlowChargeCard />
          </>
        ) : null}
      </div>
    </main>
  );
}
