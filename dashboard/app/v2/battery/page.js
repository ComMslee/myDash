'use client';

import { useState, useEffect } from 'react';
import HealthScoreCard from '@/app/v2/battery/HealthScoreCard';
import IdleDrainCard from '@/app/v2/battery/IdleDrainCard';
import MonthlyChargeCard from '@/app/v2/battery/MonthlyChargeCard';
import FastChargeCard from '@/app/v2/battery/FastChargeCard';
import SlowChargeCard from '@/app/v2/battery/SlowChargeCard';
import ChargeHeatmap from '@/app/v2/battery/ChargeHeatmap';
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
            {/* PeekSheet 메뉴에서 '#health' 등으로 직접 점프. scroll-mt 는 sticky 헤더 보정. */}
            <section id="health" className="scroll-mt-16">
              <HealthScoreCard data={data.health} trend={trend} />
            </section>
            <section id="idle" className="scroll-mt-16">
              <IdleDrainCard records={data.idle_drain} chargingSessions={data.charging_sessions} />
            </section>
            <section id="monthly" className="scroll-mt-16">
              <MonthlyChargeCard />
            </section>
            <section id="heatmap" className="scroll-mt-16">
              <ChargeHeatmap />
            </section>
            <section id="fast" className="scroll-mt-16">
              <FastChargeCard />
            </section>
            <section id="slow" className="scroll-mt-16">
              <SlowChargeCard />
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
