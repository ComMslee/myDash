'use client';

import { useState, useEffect, useMemo } from 'react';
import { useMock, MOCK_DATA } from '@/app/context/mock';
import { Spinner } from '@/app/components/PageLayout';
import { HourDowHeatmap } from '@/app/components/ChartWidgets';
import { useDetailLoader } from '@/lib/useDetailLoader';
import VehicleKpiCard from './_parts/VehicleKpiCard';
import MonthInsightsCard from './_parts/MonthInsightsCard';
import RecordsCardV2 from './_parts/RecordsCardV2';
import MonthlyHistoryByYear from './_parts/MonthlyHistoryByYear';
import SeasonalEffGrid from './_parts/SeasonalEffGrid';

function buildYearData(months) {
  const byYear = {};
  for (const m of months) {
    if (!byYear[m.year]) byYear[m.year] = [];
    byYear[m.year].push(m);
  }
  const years = Object.keys(byYear).sort((a, b) => b - a);
  const yearTotals = {};
  for (const y of years) {
    const ms = byYear[y];
    const totalKm = parseFloat(ms.reduce((s, m) => s + Number(m.total_distance_km || 0), 0).toFixed(1));
    const validWh = ms.filter(m => m.avg_wh_km != null).map(m => m.avg_wh_km);
    yearTotals[y] = {
      drive_count: ms.reduce((s, m) => s + Number(m.drive_count || 0), 0),
      total_distance_km: totalKm,
      total_duration_min: ms.reduce((s, m) => s + Number(m.total_duration_min || 0), 0),
      charge_count: ms.reduce((s, m) => s + Number(m.charge_count || 0), 0),
      total_energy_kwh: parseFloat(ms.reduce((s, m) => s + Number(m.total_energy_kwh || 0), 0).toFixed(1)),
      avg_monthly_km: ms.length > 0 ? Math.round(totalKm / ms.length) : 0,
      avg_wh_km: validWh.length > 0 ? validWh.reduce((s, v) => s + v, 0) / validWh.length : null,
    };
  }
  const maxDist = months.length > 0 ? Math.max(...months.map(m => m.total_distance_km)) : 1;
  return { byYear, years, yearTotals, maxDist };
}

export default function V2DrivesPage() {
  const { isMock, refreshSignal } = useMock();

  const [insights, setInsights] = useState(null);
  const [car, setCar] = useState(null);
  const [drivesSummary, setDrivesSummary] = useState(null);
  const [historySummary, setHistorySummary] = useState(null); // 올해 요약
  const [loading, setLoading] = useState({ insights: true, car: true });

  // 전체 이력 — 펼칠 때 로드
  const historyLoader = useDetailLoader('/api/monthly-history');

  useEffect(() => {
    if (isMock) {
      setInsights({ ...MOCK_DATA.insights, allTime: { ...MOCK_DATA.insights.sixMonth, avg_speed: 42.3, max_day_distance: 248.7, max_day_duration: 320 } });
      setCar(null);
      setLoading({ insights: false, car: false });
      return;
    }

    fetch('/api/insights').then(r => r.json())
      .then(d => { setInsights(d); setLoading(p => ({ ...p, insights: false })); })
      .catch(() => setLoading(p => ({ ...p, insights: false })));

    fetch('/api/car').then(r => r.json())
      .then(d => { setCar(d); setLoading(p => ({ ...p, car: false })); })
      .catch(() => setLoading(p => ({ ...p, car: false })));

    fetch('/api/drives?summary=1').then(r => r.json())
      .then(d => setDrivesSummary(d))
      .catch(() => null);

    fetch('/api/monthly-history?summary=1').then(r => r.json())
      .then(d => setHistorySummary(d))
      .catch(() => null);
  }, [isMock, refreshSignal]);

  const now = new Date();
  const curYear = now.getFullYear();

  // 전체 이력 로드 후 → historySummary 대체
  const activeHistory = historyLoader.data || historySummary;

  const { byYear, years, yearTotals, maxDist } = useMemo(
    () => buildYearData(activeHistory?.months || []),
    [activeHistory]
  );
  const driveDaysByYear = activeHistory?.driveDaysByYear || {};
  const seasonalEff = activeHistory?.seasonalEff || {};
  const isSummaryOnly = !historyLoader.isLoaded;

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 py-5 pb-3 space-y-5">

        {/* 1. 차량 요약 */}
        {loading.car || loading.insights ? <Spinner /> : (
          <VehicleKpiCard car={car} insights={insights} drives={drivesSummary ?? historyLoader.data} />
        )}

        {/* 2. 이번달 인사이트 */}
        {!loading.insights && <MonthInsightsCard insights={insights} />}

        {/* 3. 주행 패턴 히트맵 */}
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

        {/* 4. TOP 50 기록 */}
        {!loading.insights && <RecordsCardV2 allTime={insights?.allTime} />}

        {/* 5. 월간 통계 — 올해는 즉시, 이전 연도는 펼칠 때 로드 */}
        {activeHistory ? (
          <>
            <MonthlyHistoryByYear
              years={years}
              byYear={byYear}
              yearTotals={yearTotals}
              driveDaysByYear={driveDaysByYear}
              curYear={curYear}
              maxDist={maxDist}
            />
            {/* 이전 연도 더보기 — 요약 모드(올해만)일 때 표시 */}
            {isSummaryOnly && (
              <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-3">
                <button
                  onClick={historyLoader.load}
                  disabled={historyLoader.isLoading}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors py-1 disabled:opacity-50"
                >
                  {historyLoader.isLoading
                    ? <span className="w-3 h-3 border border-zinc-500 border-t-transparent rounded-full animate-spin" />
                    : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  }
                  {historyLoader.isLoading ? '로딩 중...' : '이전 연도 통계 불러오기'}
                </button>
              </div>
            )}
            {!isSummaryOnly && <SeasonalEffGrid seasonalEff={seasonalEff} />}
          </>
        ) : (
          <div className="bg-[#161618] border border-white/[0.06] rounded-2xl flex items-center justify-center py-6">
            <div className="w-4 h-4 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
          </div>
        )}
      </div>
    </main>
  );
}
