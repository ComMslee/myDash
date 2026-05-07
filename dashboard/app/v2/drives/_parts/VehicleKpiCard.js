'use client';

import { effColor } from '@/lib/effColor';

const PERIOD_DEFS = [
  { label: '오늘',     kmKey: 'today_distance',     kwhKey: 'today_energy_kwh',     highlight: false },
  { label: '이번주',   kmKey: 'week_distance',      kwhKey: 'week_energy_kwh',      highlight: false },
  { label: '저번주',   kmKey: 'prev_week_distance', kwhKey: 'prev_week_energy_kwh', highlight: false },
  { label: '최근 4주', kmKey: 'month_distance',     kwhKey: 'month_energy_kwh',     highlight: true  },
];

export default function VehicleKpiCard({ car, insights, drives }) {
  const odometer = car?.odometer;
  const recentEff = insights?.sixMonth?.efficiency_wh_km ?? null;
  const allTimeEff = insights?.allTime?.efficiency_wh_km ?? null;

  const stats = PERIOD_DEFS.map(d => ({
    label: d.label,
    km: drives?.[d.kmKey] ?? 0,
    kwh: drives?.[d.kwhKey] ?? 0,
    highlight: d.highlight,
  }));

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      {/* 헤더 — 누적거리 + 효율 KPI */}
      <div className="px-4 py-3 flex items-center gap-4 border-b border-white/[0.06]">
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
              {allTimeEff != null && (
                <span className="text-[10px] font-normal text-zinc-600 ml-1.5">(전기간 {allTimeEff.toFixed(0)})</span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* 본문 — 기간별 통계 */}
      {stats.map((s, i) => {
        const eff = s.km > 0 && s.kwh > 0 ? (s.kwh / s.km * 1000).toFixed(0) : null;
        const isEmpty = s.km === 0 && s.kwh === 0;
        return (
          <div
            key={s.label}
            className={`grid grid-cols-4 px-4 py-3 items-center ${i < stats.length - 1 ? 'border-b border-white/[0.04]' : ''} ${s.highlight ? 'bg-blue-500/[0.04]' : ''}`}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-zinc-400">{s.label}</span>
            </div>
            <div className="text-center">
              {isEmpty ? (
                <span className="text-base font-black tabular-nums text-zinc-700">—</span>
              ) : (
                <>
                  <span className="text-lg font-black tabular-nums leading-none text-blue-400">{s.km}</span>
                  <span className="text-[10px] text-zinc-600 ml-0.5">km</span>
                </>
              )}
            </div>
            <div className="text-center">
              {isEmpty ? (
                <span className="text-sm font-bold tabular-nums text-zinc-700">—</span>
              ) : (
                <>
                  <span className="text-sm font-bold tabular-nums leading-none text-green-400">{s.kwh}</span>
                  <span className="text-[10px] text-zinc-600 ml-0.5">kWh</span>
                </>
              )}
            </div>
            <div className="text-center">
              {!eff ? (
                <span className="text-sm font-bold tabular-nums text-zinc-700">—</span>
              ) : (
                <>
                  <span className="text-sm font-bold tabular-nums leading-none text-amber-400">{eff}</span>
                  <span className="text-[10px] text-zinc-600 ml-0.5">Wh/km</span>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
