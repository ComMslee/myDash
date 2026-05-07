'use client';

import { useState, useEffect } from 'react';
import { useMock, MOCK_DATA } from '@/app/context/mock';
import { Spinner } from '@/app/components/PageLayout';
import { HourDowHeatmap } from '@/app/components/ChartWidgets';
import YearHeatmap from '@/app/components/YearHeatmap';
import VehicleKpiCard from './_parts/VehicleKpiCard';
import PeriodStats from './_parts/PeriodStats';
import MonthInsightsCard from './_parts/MonthInsightsCard';
import RecordsCardV2 from './_parts/RecordsCardV2';
import MonthlyHistoryByYear from './_parts/MonthlyHistoryByYear';
import SeasonalEffGrid from './_parts/SeasonalEffGrid';

export default function V2DrivesPage() {
  const { isMock, refreshSignal } = useMock();

  const [drives, setDrives] = useState(null);
  const [insights, setInsights] = useState(null);
  const [yearHeatmap, setYearHeatmap] = useState(null);
  const [monthlyHistory, setMonthlyHistory] = useState(null);
  const [car, setCar] = useState(null);
  const [loading, setLoading] = useState({ drives: true, insights: true, heatmap: true, history: true, car: true });

  useEffect(() => {
    if (isMock) {
      setDrives(MOCK_DATA.drives);
      setInsights({ ...MOCK_DATA.insights, allTime: { ...MOCK_DATA.insights.sixMonth, avg_speed: 42.3, max_day_distance: 248.7, max_day_duration: 320 } });
      setYearHeatmap(MOCK_DATA.yearHeatmap || null);
      setMonthlyHistory(MOCK_DATA.monthlyHistory || null);
      setCar(null);
      setLoading({ drives: false, insights: false, heatmap: false, history: false, car: false });
      return;
    }

    fetch('/api/drives').then(r => r.json())
      .then(d => { setDrives(d); setLoading(p => ({ ...p, drives: false })); })
      .catch(() => setLoading(p => ({ ...p, drives: false })));

    fetch('/api/insights').then(r => r.json())
      .then(d => { setInsights(d); setLoading(p => ({ ...p, insights: false })); })
      .catch(() => setLoading(p => ({ ...p, insights: false })));

    fetch('/api/year-heatmap').then(r => r.json())
      .then(d => { setYearHeatmap(d); setLoading(p => ({ ...p, heatmap: false })); })
      .catch(() => setLoading(p => ({ ...p, heatmap: false })));

    fetch('/api/monthly-history').then(r => r.json())
      .then(d => { setMonthlyHistory(d); setLoading(p => ({ ...p, history: false })); })
      .catch(() => setLoading(p => ({ ...p, history: false })));

    fetch('/api/car').then(r => r.json())
      .then(d => { setCar(d); setLoading(p => ({ ...p, car: false })); })
      .catch(() => setLoading(p => ({ ...p, car: false })));
  }, [isMock, refreshSignal]);

  const months = monthlyHistory?.months || [];
  const driveDaysByYear = monthlyHistory?.driveDaysByYear || {};
  const seasonalEff = monthlyHistory?.seasonalEff || {};
  const now = new Date();
  const curYear = now.getFullYear();

  const byYear = {};
  for (const m of months) {
    if (!byYear[m.year]) byYear[m.year] = [];
    byYear[m.year].push(m);
  }
  const years = Object.keys(byYear).sort((a, b) => b - a);

  const yearTotals = {};
  for (const y of years) {
    const ms = byYear[y];
    const monthCount = ms.length;
    const totalKm = parseFloat(ms.reduce((s, m) => s + Number(m.total_distance_km || 0), 0).toFixed(1));
    const validWh = ms.filter(m => m.avg_wh_km != null).map(m => m.avg_wh_km);
    const avgWhKm = validWh.length > 0 ? validWh.reduce((s, v) => s + v, 0) / validWh.length : null;
    yearTotals[y] = {
      drive_count: ms.reduce((s, m) => s + Number(m.drive_count || 0), 0),
      total_distance_km: totalKm,
      total_duration_min: ms.reduce((s, m) => s + Number(m.total_duration_min || 0), 0),
      charge_count: ms.reduce((s, m) => s + Number(m.charge_count || 0), 0),
      total_energy_kwh: parseFloat(ms.reduce((s, m) => s + Number(m.total_energy_kwh || 0), 0).toFixed(1)),
      avg_monthly_km: monthCount > 0 ? Math.round(totalKm / monthCount) : 0,
      avg_wh_km: avgWhKm,
    };
  }

  const maxDist = months.length > 0 ? Math.max(...months.map(m => m.total_distance_km)) : 1;

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 py-5 pb-24 space-y-5">

        {/* 1. 차량 KPI 헤더 */}
        {!loading.car && !loading.insights && (
          <VehicleKpiCard car={car} insights={insights} />
        )}

        {/* 2. 기간별 통계 (이번달 포함) */}
        {loading.drives || loading.history ? <Spinner /> : (
          <PeriodStats drives={drives} monthlyHistory={monthlyHistory} />
        )}

        {/* 3. 이번달 인사이트 */}
        {!loading.insights && <MonthInsightsCard insights={insights} />}

        {/* 4. 연간 히트맵 */}
        <YearHeatmap
          data={yearHeatmap}
          loading={loading.heatmap}
          title=""
          metric="km"
          color="#3b82f6"
          legendLabel="주행"
          latestLeft
        />

        {/* 5. 주행 패턴 — 시간×요일 히트맵 */}
        {insights?.hour_dow && (
          <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="px-3 py-2 border-b border-white/[0.06]">
              <span className="text-[11px] font-bold tracking-widest uppercase text-zinc-500">주행 패턴</span>
            </div>
            <div className="px-4 pt-4 pb-4">
              <HourDowHeatmap data={insights.hour_dow} hexColor="#3b82f6" />
            </div>
          </div>
        )}

        {/* 6. TOP 50 기록 (랭킹 시트) */}
        {!loading.insights && <RecordsCardV2 allTime={insights?.allTime} />}

        {/* 7. 연도별 월간 통계 + 계절별 효율 */}
        {loading.history ? <Spinner /> : months.length === 0 ? (
          <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-6 text-center text-zinc-600 text-xs">
            데이터가 없습니다
          </div>
        ) : (
          <>
            <MonthlyHistoryByYear
              years={years}
              byYear={byYear}
              yearTotals={yearTotals}
              driveDaysByYear={driveDaysByYear}
              curYear={curYear}
              maxDist={maxDist}
            />
            <SeasonalEffGrid seasonalEff={seasonalEff} />
          </>
        )}
      </div>
    </main>
  );
}
