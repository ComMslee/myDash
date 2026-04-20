'use client';

import { useState, useEffect } from 'react';
import HealthScoreCard from './HealthScoreCard';
import IdleDrainCard from './IdleDrainCard';
import { LevelHabitCard } from './RecordsHabit';
import MonthlyChargeCard from './MonthlyChargeCard';
import FastChargeCard from './FastChargeCard';
import { CapacityTrendCard } from './BatteryTrendCard';
import ChargeSummaryCard from './ChargeSummaryCard';
import ChargeHeatmap from './ChargeHeatmap';
import { Spinner } from '@/app/components/PageLayout';

export default function BatteryPage() {
  const [data, setData] = useState(null);
  const [trend, setTrend] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/battery').then(r => r.json()),
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
  }, []);

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 py-5 pb-24 flex flex-col gap-5">
        {loading ? (
          <Spinner />
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        ) : data ? (
          <>
            {/* 충전 현황 — 타임라인 */}
            <ChargeSummaryCard />

            {/* 배터리 상태 — 헬스 + 용량 트렌드 */}
            <HealthScoreCard data={data.health} />
            <CapacityTrendCard data={trend} />

            {/* 충전 습관 */}
            <LevelHabitCard histogram={data.histogram} />

            {/* 충전 통계 */}
            <MonthlyChargeCard />

            {/* 연간 충전 히트맵 (최신 왼쪽, 충전만) */}
            <ChargeHeatmap />

            {/* 급속 충전 */}
            <FastChargeCard />

            {/* 대기 소모 */}
            <IdleDrainCard records={data.idle_drain} />
          </>
        ) : null}
      </div>
    </main>
  );
}
