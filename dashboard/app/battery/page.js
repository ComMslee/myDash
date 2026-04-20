'use client';

import { useState, useEffect } from 'react';
import HealthScoreCard from './HealthScoreCard';
import IdleDrainCard from './IdleDrainCard';
import { LevelHabitCard } from './RecordsHabit';
import MonthlyChargeCard from './MonthlyChargeCard';
import FastChargeCard from './FastChargeCard';
import SlowChargeCard from './SlowChargeCard';
import ChargeHeatmap from './ChargeHeatmap';
import HomeChargerCard from './HomeChargerCard';
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
            {/* 배터리 건강 — 점수/평균SOC/추이 + SOC 체류 분포 */}
            <HealthScoreCard data={data.health} trend={trend} />

            {/* 배터리 건강 — 대기 소모 */}
            <IdleDrainCard records={data.idle_drain} chargingSessions={data.charging_sessions} />

            {/* 현재 상태 — 집충전기 실시간 */}
            <HomeChargerCard />

            {/* 충전 습관 — SOC 시작/종료 분포 */}
            <LevelHabitCard histogram={data.histogram} />

            {/* 충전 습관 — 요약 */}
            <MonthlyChargeCard />

            {/* 충전 습관 — 연간 히트맵 */}
            <ChargeHeatmap />

            {/* 충전 상세 — 급속 */}
            <FastChargeCard />

            {/* 충전 상세 — 완속 */}
            <SlowChargeCard />
          </>
        ) : null}
      </div>
    </main>
  );
}
