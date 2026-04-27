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

// ── 누적 충전 통계 — 내 차의 충전 행위 ────────────────────────
function ChargingStatsCard({ chargeAll }) {
  if (!chargeAll) return null;
  const rows = [
    { label: '총 충전 횟수',  value: chargeAll.charge_count,  unit: '회',  color: 'text-zinc-200' },
    { label: '집 충전',       value: chargeAll.home_charges,  unit: '회',  color: 'text-emerald-400' },
    { label: '외부 충전',     value: chargeAll.other_charges, unit: '회',  color: 'text-amber-400' },
    { label: '급속 충전',     value: chargeAll.fast_charges,  unit: '회',  color: 'text-blue-400' },
    { label: '완속 충전',     value: chargeAll.slow_charges,  unit: '회',  color: 'text-violet-400' },
    { label: '총 충전량',     value: Number(chargeAll.total_kwh).toLocaleString(), unit: 'kWh', color: 'text-cyan-400' },
    { label: '회당 평균',     value: Number(chargeAll.avg_kwh).toFixed(1), unit: 'kWh', color: 'text-zinc-400' },
  ];
  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-3 py-2 border-b border-white/[0.06]">
        <span className="text-[11px] font-bold tracking-widest uppercase text-zinc-500">누적 충전 통계</span>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {rows.map(row => (
          <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-zinc-500">{row.label}</span>
            <span className={`text-sm font-bold tabular-nums ${row.color}`}>
              {row.value}
              <span className="text-xs font-normal text-zinc-600 ml-0.5">{row.unit}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function V2BatteryPage() {
  const [data, setData] = useState(null);
  const [trend, setTrend] = useState(null);
  const [chargeAll, setChargeAll] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/battery').then(r => r.json()),
      fetch('/api/battery-trend').then(r => r.json()),
      fetch('/api/charge-all-time').then(r => r.json()),
    ])
      .then(([batteryData, trendData, chargeAllData]) => {
        if (batteryData.error) throw new Error(batteryData.error);
        setData(batteryData);
        setTrend(trendData.error ? null : trendData);
        setChargeAll(chargeAllData.error ? null : chargeAllData);
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
            <ChargingStatsCard chargeAll={chargeAll} />
          </>
        ) : null}
      </div>
    </main>
  );
}
