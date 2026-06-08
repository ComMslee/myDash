'use client';

import { useState, useEffect } from 'react';
import RangeMapCard from '@/app/v2/battery/RangeMapCard';
import HealthScoreCard from '@/app/v2/battery/HealthScoreCard';
import IdleDrainCard from '@/app/v2/battery/IdleDrainCard';
import MonthlyChargeCard from '@/app/v2/battery/MonthlyChargeCard';
import FastChargeCard from '@/app/v2/battery/FastChargeCard';
import SlowChargeCard from '@/app/v2/battery/SlowChargeCard';
import ChargingLocationsCard from '@/app/v2/battery/ChargingLocationsCard';
import { Spinner } from '@/app/components/PageLayout';
import { useDetailLoader } from '@/lib/useDetailLoader';
import ExpandableSection from '@/app/components/ExpandableSection';

export default function V2BatteryPage() {
  const [data, setData] = useState(null);
  const [trend, setTrend] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 대기 배터리 손실: 페이지 마운트 시 로드하지 않고 사용자가 펼칠 때 로드
  const idleDrain = useDetailLoader('/api/idle-drain');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/battery?summary=1').then(r => r.json()),
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
      <div className="max-w-2xl mx-auto px-4 py-4 pb-3 flex flex-col gap-3">
        {loading ? (
          <Spinner />
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        ) : data ? (
          <>
            <RangeMapCard />
            <HealthScoreCard data={data.health} trend={trend} />

            {/* IdleDrainCard — 펼칠 때 로드 */}
            {idleDrain.isLoaded && idleDrain.data ? (
              <IdleDrainCard
                records={idleDrain.data.idle_drain}
                chargingSessions={idleDrain.data.charging_sessions}
              />
            ) : (
              <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-3">
                <div className="text-[11px] font-bold tracking-widest uppercase text-zinc-500">대기 배터리 손실</div>
                <ExpandableSection
                  onExpand={idleDrain.load}
                  isLoading={idleDrain.isLoading}
                  isLoaded={false}
                  label="상세 데이터 로드"
                >
                  {null}
                </ExpandableSection>
              </div>
            )}

            <MonthlyChargeCard />
            <ChargingLocationsCard />
            <FastChargeCard />
            <SlowChargeCard />
          </>
        ) : null}
      </div>
    </main>
  );
}
