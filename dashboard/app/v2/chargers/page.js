'use client';

import { useState, useEffect } from 'react';
import HomeChargerCard from '@/app/battery/HomeChargerCard';
import { Spinner } from '@/app/components/PageLayout';

// ── NEW 배지 ──────────────────────────────────────────────────
function NewBadge() {
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gradient-to-br from-blue-500 to-violet-500 text-white leading-none">NEW</span>
  );
}

// ── 충전 사용 TOP 카드 ────────────────────────────────────────
function TopChargersCard({ chargeAll }) {
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
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
        <span className="text-xs font-bold text-zinc-400 tracking-wider uppercase">충전 통계</span>
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

// ── 충전 시간대 히트맵 (준비 중) ──────────────────────────────
function ChargeTimeHeatmapCard() {
  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold text-zinc-400 tracking-wider uppercase">시간대별 충전 패턴</span>
        <NewBadge />
      </div>
      <div className="py-8 text-center">
        <p className="text-2xl mb-2">⏰</p>
        <p className="text-sm text-zinc-500">시간대×요일 충전 히트맵</p>
        <p className="text-xs text-zinc-600 mt-1">충전 데이터 누적 후 제공 예정</p>
      </div>
    </div>
  );
}

// ── 주변 급속 충전소 (준비 중) ────────────────────────────────
function NearbyChargersCard() {
  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold text-zinc-400 tracking-wider uppercase">주변 급속 충전소</span>
        <NewBadge />
      </div>
      <div className="py-8 text-center">
        <p className="text-2xl mb-2">📍</p>
        <p className="text-sm text-zinc-500">위치 기반 실시간 충전소 현황</p>
        <p className="text-xs text-zinc-600 mt-1">GPS 연동 후 제공 예정</p>
      </div>
    </div>
  );
}

// ── 페이지 ────────────────────────────────────────────────────
export default function V2ChargersPage() {
  const [chargeAll, setChargeAll] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/charge-all-time')
      .then(r => r.json())
      .then(d => {
        setChargeAll(d.error ? null : d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 py-5 pb-24 flex flex-col gap-5">
        {/* 집충전기 실시간 현황 */}
        <HomeChargerCard />

        {/* 충전 통계 요약 */}
        {loading ? <Spinner /> : <TopChargersCard chargeAll={chargeAll} />}

        {/* 시간대별 충전 패턴 — 준비 중 */}
        <ChargeTimeHeatmapCard />

        {/* 주변 급속 충전소 — 준비 중 */}
        <NearbyChargersCard />
      </div>
    </main>
  );
}
