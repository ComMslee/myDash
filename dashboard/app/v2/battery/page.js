'use client';

import { useState, useEffect } from 'react';
import HealthScoreCard from '@/app/v1/battery/HealthScoreCard';
import IdleDrainCard from '@/app/v1/battery/IdleDrainCard';
import { LevelHabitCard } from '@/app/v1/battery/RecordsHabit';
import MonthlyChargeCard from '@/app/v1/battery/MonthlyChargeCard';
import FastChargeCard from '@/app/v1/battery/FastChargeCard';
import SlowChargeCard from '@/app/v1/battery/SlowChargeCard';
import ChargeHeatmap from '@/app/v1/battery/ChargeHeatmap';
import { Spinner } from '@/app/components/PageLayout';

export default function V2BatteryPage() {
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
            <HealthScoreCard data={data.health} trend={trend} />
            <IdleDrainCard records={data.idle_drain} chargingSessions={data.charging_sessions} />
            <LevelHabitCard histogram={data.histogram} />
            <MonthlyChargeCard />
            <ChargeHeatmap />
            <FastChargeCard />
            <SlowChargeCard />
          </>
        ) : null}
      </div>
    </main>
  );
}
