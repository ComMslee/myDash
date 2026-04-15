'use client';

import { useEffect, useState } from 'react';

// 홈에서 이동: 마지막 충전 + 추천 충전일
export default function ChargeSummaryCard() {
  const [car, setCar] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/car')
      .then(r => r.json())
      .then(d => { setCar(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  if (!car) return null;

  const lc = car.last_charge;
  const ec = car.estimated_charge;

  const elapsed = lc ? (() => {
    const diffMs = Date.now() - new Date(lc.end_date).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `${diffMin}분 전`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}시간 전`;
    const diffD = Math.floor(diffH / 24);
    const remH = diffH % 24;
    return remH > 0 ? `${diffD}일 ${remH}시간 전` : `${diffD}일 전`;
  })() : null;

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      {/* 마지막 충전 */}
      <div className="px-4 py-3 flex items-center justify-between">
        <span className="text-xs text-zinc-500">마지막 충전</span>
        <div className="flex items-center gap-2 text-xs tabular-nums">
          {lc
            ? <>
                <span className="text-zinc-300 font-semibold">{elapsed}</span>
                {lc.location && <span className="text-zinc-500">{lc.location}</span>}
                {lc.soc_start != null && lc.soc_end != null && (
                  <span className="text-zinc-500">{lc.soc_start}→{lc.soc_end}%</span>
                )}
              </>
            : <span className="text-zinc-700">—</span>
          }
        </div>
      </div>

      {/* 추천 충전일 */}
      {ec && (() => {
        const target = new Date(ec.date);
        const dateLabel = `${target.getMonth() + 1}/${target.getDate()}`;
        const daysLabel = ec.days_until === 0 ? '곧' : `${ec.days_until}일 후`;
        const urgent = ec.days_until <= 2;
        const thresholdLabel = ec.threshold_source === 'learned'
          ? `${ec.threshold_pct}% 습관`
          : `${ec.threshold_pct}% 도달`;
        return (
          <div className="px-4 py-3 border-t border-white/[0.06] flex items-center justify-between">
            <span className="text-xs text-zinc-500">추천 충전일</span>
            <div className="flex items-center gap-2 text-xs tabular-nums">
              <span className={`font-bold ${urgent ? 'text-rose-400' : 'text-amber-400'}`}>{daysLabel}</span>
              <span className="text-zinc-400">{dateLabel}</span>
              <span className="text-zinc-600">{thresholdLabel}</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
