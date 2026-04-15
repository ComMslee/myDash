'use client';
import { useState, useEffect } from 'react';
import { HourlyHeatmap, WeekdayBars } from '@/app/components/ChartWidgets';

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
      <div className="px-4 py-3">
        {/* 회당 평균만 표시 */}
        <div className="mb-4 text-center">
          <p className="text-zinc-600 text-xs mb-1">회당 평균</p>
          <p className="text-emerald-400 font-bold text-lg tabular-nums">{data.avg_kwh}<span className="text-zinc-600 text-xs ml-0.5">kWh</span></p>
        </div>

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
            <span className="text-blue-400">완속 {data.slow_charges}회</span>
            <span className="text-rose-400">급속 {data.fast_charges}회</span>
          </div>
          <div className="h-2.5 bg-zinc-800 rounded-full overflow-hidden flex">
            <div className="h-full bg-blue-500 transition-all" style={{ width: `${slowRatio * 100}%` }} />
            <div className="h-full bg-rose-500 transition-all" style={{ width: `${fastRatio * 100}%` }} />
          </div>
          <div className="flex justify-between text-xs text-zinc-600 mt-1">
            <span>{(slowRatio * 100).toFixed(0)}%</span>
            <span>{(fastRatio * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* 시간대별 / 요일별 */}
        <div className="pt-4 border-t border-white/[0.06]">
          <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1.5">시간대별 충전</p>
          <HourlyHeatmap data={data.charge_hourly} hexColor="#22c55e" />
          <p className="text-[9px] text-zinc-600 uppercase tracking-wider mt-4 mb-1.5">요일별 충전</p>
          <WeekdayBars data={data.charge_weekday} hexColor="#22c55e" />
        </div>
      </div>
    </div>
  );
}
