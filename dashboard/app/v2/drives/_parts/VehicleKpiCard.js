'use client';

import { effColor } from '@/lib/effColor';

export default function VehicleKpiCard({ car, insights }) {
  const odometer = car?.odometer;
  const recentEff = insights?.sixMonth?.efficiency_wh_km ?? null;
  const allTimeEff = insights?.allTime?.efficiency_wh_km ?? null;

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-3 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-zinc-500 font-semibold tracking-widest uppercase mb-0.5">누적 주행거리</p>
        {odometer != null ? (
          <p className="text-xl font-black tabular-nums text-white">
            {Number(odometer).toLocaleString()}
            <span className="text-xs text-zinc-600 ml-1 font-normal">km</span>
          </p>
        ) : (
          <p className="text-xl font-black text-zinc-700">—</p>
        )}
      </div>
      {(recentEff != null || allTimeEff != null) && (
        <div className="text-right shrink-0">
          <p className="text-[10px] text-zinc-600 mb-0.5">최근 6개월 효율</p>
          <p className="text-sm font-bold tabular-nums" style={{ color: recentEff ? effColor(recentEff) : '#52525b' }}>
            {recentEff ? `${recentEff.toFixed(0)} Wh/km` : '—'}
          </p>
          {allTimeEff != null && (
            <p className="text-[10px] text-zinc-600">전기간 {allTimeEff.toFixed(0)}</p>
          )}
        </div>
      )}
    </div>
  );
}
