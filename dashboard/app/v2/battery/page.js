'use client';

import { useState, useEffect } from 'react';
import HealthScoreCard from '@/app/battery/HealthScoreCard';
import IdleDrainCard from '@/app/battery/IdleDrainCard';
import { LevelHabitCard } from '@/app/battery/RecordsHabit';
import MonthlyChargeCard from '@/app/battery/MonthlyChargeCard';
import FastChargeCard from '@/app/battery/FastChargeCard';
import SlowChargeCard from '@/app/battery/SlowChargeCard';
import ChargeHeatmap from '@/app/battery/ChargeHeatmap';
import { Spinner } from '@/app/components/PageLayout';

// ── NEW 배지 ──────────────────────────────────────────────────
function NewBadge() {
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gradient-to-br from-blue-500 to-violet-500 text-white leading-none">NEW</span>
  );
}

// ── 누적 KPI 카드 ────────────────────────────────────────────
function CumulativeKpiCard({ chargeAll, trend }) {
  // SOH % — battery-trend 에서 마지막 degradation 값 역산
  const soh = (() => {
    if (!trend?.degradation || trend.degradation.length === 0) return null;
    const last = trend.degradation[trend.degradation.length - 1];
    if (last?.degradation_pct == null) return null;
    return (100 - Number(last.degradation_pct)).toFixed(1);
  })();

  const totalKwh = chargeAll?.total_kwh ?? null;
  // 비용: kWh당 평균 ₩200 (완속 기준 근사값)
  const totalCost = totalKwh != null ? Math.round(totalKwh * 200) : null;

  const cols = [
    {
      label: 'SOH',
      badge: <NewBadge />,
      value: soh != null ? `${soh}%` : '—',
      sub: '배터리 건강도',
      color: soh != null ? (Number(soh) >= 95 ? 'text-emerald-400' : Number(soh) >= 90 ? 'text-amber-400' : 'text-rose-400') : 'text-zinc-600',
    },
    {
      label: '누적 충전량',
      value: totalKwh != null ? `${Number(totalKwh).toLocaleString()}` : '—',
      unit: 'kWh',
      sub: `${chargeAll?.charge_count ?? '?'}회 충전`,
      color: 'text-blue-400',
    },
    {
      label: '누적 비용',
      badge: <NewBadge />,
      value: totalCost != null ? `₩${Math.round(totalCost / 10000)}만` : '—',
      sub: totalCost != null ? `≈ ₩${totalCost.toLocaleString()}` : '(₩200/kWh 추정)',
      color: 'text-violet-400',
    },
  ];

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-4 pt-3 pb-1 flex items-center gap-2">
        <span className="text-xs font-bold text-zinc-400 tracking-wider uppercase">누적 현황</span>
      </div>
      <div className="grid grid-cols-3 divide-x divide-white/[0.06] px-0 pb-3">
        {cols.map(col => (
          <div key={col.label} className="flex flex-col items-center py-2 px-2 gap-0.5">
            <div className="flex items-center gap-1 mb-0.5">
              <p className="text-[10px] text-zinc-500 font-semibold">{col.label}</p>
              {col.badge}
            </div>
            <p className={`text-lg font-black tabular-nums ${col.color}`}>
              {col.value}
              {col.unit && <span className="text-xs font-medium text-zinc-600 ml-0.5">{col.unit}</span>}
            </p>
            <p className="text-[10px] text-zinc-600 text-center leading-tight">{col.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 안전한 사용 카드 (준비 중) ────────────────────────────────
function SafeUsageCard() {
  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold text-zinc-400 tracking-wider uppercase">안전한 사용 가이드</span>
        <NewBadge />
      </div>
      <div className="py-8 text-center">
        <p className="text-2xl mb-2">🔋</p>
        <p className="text-sm text-zinc-500">배터리 수명 최적화 분석</p>
        <p className="text-xs text-zinc-600 mt-1">충전 패턴 기반 개인화 가이드 준비 중</p>
      </div>
    </div>
  );
}

// ── 페이지 ────────────────────────────────────────────────────
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
            {/* 누적 KPI — SOH / 누적 kWh / 누적 비용 */}
            <CumulativeKpiCard chargeAll={chargeAll} trend={trend} />

            {/* 배터리 건강 — 점수/평균SOC/추이 + SOC 체류 분포 */}
            <HealthScoreCard data={data.health} trend={trend} />

            {/* 안전한 사용 가이드 — 준비 중 */}
            <SafeUsageCard />

            {/* 배터리 건강 — 대기 소모 */}
            <IdleDrainCard records={data.idle_drain} chargingSessions={data.charging_sessions} />

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
