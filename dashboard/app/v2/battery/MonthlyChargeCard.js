'use client';
import { useState, useEffect } from 'react';
import { HourDowHeatmap } from '@/app/components/ChartWidgets';

export default function MonthlyChargeCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/charge-all-time')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl flex items-center justify-center py-10">
        <div className="w-5 h-5 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }
  if (!data || data.error) return null;

  const homeRatio = data.charge_count > 0 ? data.home_charges / data.charge_count : 0;
  const otherRatio = data.charge_count > 0 ? data.other_charges / data.charge_count : 0;
  const fastRatio = data.charge_count > 0 ? data.fast_charges / data.charge_count : 0;
  const slowRatio = data.charge_count > 0 ? data.slow_charges / data.charge_count : 0;

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      {/* 헤더 — 회당 평균을 헤더 부속으로 */}
      <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-widest uppercase text-zinc-500">충전 요약</span>
        <span className="text-[11px] text-zinc-500 tabular-nums">
          회당 평균 <span className="text-emerald-400 font-bold">{data.avg_kwh}</span>
          <span className="text-zinc-600 ml-0.5">kWh</span>
        </span>
      </div>

      <div className="px-4 py-3">
        {/* 집충전 / 외부충전 */}
        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-emerald-400">집충전 {data.home_charges}회</span>
            <span className="text-amber-400">외부충전 {data.other_charges}회</span>
          </div>
          <div className="h-2.5 bg-zinc-800 rounded-full overflow-hidden flex">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${homeRatio * 100}%` }} />
            <div className="h-full bg-amber-500 transition-all" style={{ width: `${otherRatio * 100}%` }} />
          </div>
          <div className="flex justify-between text-xs text-zinc-600 mt-1">
            <span>{(homeRatio * 100).toFixed(0)}%</span>
            <span>{(otherRatio * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* 완속 / 급속 */}
        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-emerald-400">완속 {data.slow_charges}회</span>
            <span className="text-rose-400">급속 {data.fast_charges}회</span>
          </div>
          <div className="h-2.5 bg-zinc-800 rounded-full overflow-hidden flex">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${slowRatio * 100}%` }} />
            <div className="h-full bg-rose-500 transition-all" style={{ width: `${fastRatio * 100}%` }} />
          </div>
          <div className="flex justify-between text-xs text-zinc-600 mt-1">
            <span>{(slowRatio * 100).toFixed(0)}%</span>
            <span>{(fastRatio * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* 시간×요일 히트맵 */}
        <div className="pt-4 border-t border-white/[0.06]">
          <HourDowHeatmap data={data.charge_hour_dow} hexColor="#34d399" />
        </div>
      </div>
    </div>
  );
}
