'use client';

import { useState, useEffect } from 'react';
import { useMock, MOCK_DATA } from '@/app/context/mock';
import { Spinner } from '@/app/components/PageLayout';
import { HourDowHeatmap } from '@/app/components/ChartWidgets';
import { useDetailLoader } from '@/lib/useDetailLoader';
import ExpandableSection from '@/app/components/ExpandableSection';
import VehicleKpiCard from './_parts/VehicleKpiCard';
import MonthInsightsCard from './_parts/MonthInsightsCard';
import RecordsCardV2 from './_parts/RecordsCardV2';
import MonthlyHistoryByYear from './_parts/MonthlyHistoryByYear';
import SeasonalEffGrid from './_parts/SeasonalEffGrid';

export default function V2DrivesPage() {
  const { isMock, refreshSignal } = useMock();

  const [insights, setInsights] = useState(null);
  const [car, setCar] = useState(null);
  const [loading, setLoading] = useState({ insights: true, car: true });

  // 무거운 데이터: 펼칠 때 로드
  const drivesLoader = useDetailLoader('/api/drives');
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
  }, [isMock, refreshSignal]);

  // monthly-history 계산 (로드된 경우에만)
  const monthlyHistory = historyLoader.data;
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
      <div className="max-w-2xl mx-auto px-4 py-5 pb-3 space-y-5">

        {/* 1. 차량 요약 */}
        {loading.car || loading.insights ? <Spinner /> : (
          <VehicleKpiCard car={car} insights={insights} drives={drivesLoader.data} />
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

        {/* 5. 연도별 월간 통계 — 펼칠 때 로드 */}
        {historyLoader.isLoaded ? (
          months.length === 0 ? (
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
          )
        ) : (
          <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-3">
            <div className="text-[11px] font-bold tracking-widest uppercase text-zinc-500">연도별 월간 통계</div>
            <ExpandableSection
              onExpand={historyLoader.load}
              isLoading={historyLoader.isLoading}
              isLoaded={false}
              label="통계 불러오기"
            >
              {null}
            </ExpandableSection>
          </div>
        )}
      </div>
    </main>
  );
}
