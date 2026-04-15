'use client';

import { useEffect, useState } from 'react';

// 경과 시간을 "X시간 전" / "Y일 전" 형태로
function elapsedLabel(isoDate) {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}시간 전`;
  const diffD = Math.floor(diffH / 24);
  const remH = diffH % 24;
  return remH > 0 ? `${diffD}일 ${remH}시간 전` : `${diffD}일 전`;
}

function FlagIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v18M5 4h11l-2 4 2 4H5" />
    </svg>
  );
}

function TargetIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

// 홈에서 이동: 마지막 충전 + 추천 충전일을 수평 타임라인으로 표현
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
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl flex items-center justify-center py-10">
        <div className="w-5 h-5 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  if (!car) return null;

  const lc = car.last_charge;
  const ec = car.estimated_charge;

  const lastTs = lc?.end_date ? new Date(lc.end_date).getTime() : null;
  const targetTs = ec?.date ? new Date(ec.date).getTime() : null;
  const nowTs = Date.now();

  // 현재 위치 비율 (0: 방금 충전 / 1: 충전 시점 임박 또는 지남)
  let currentPct = null;
  let overdue = false;
  if (lastTs && targetTs && targetTs > lastTs) {
    const raw = (nowTs - lastTs) / (targetTs - lastTs);
    currentPct = Math.max(0, Math.min(1, raw)) * 100;
    overdue = raw >= 1;
  } else if (lastTs && !targetTs) {
    currentPct = 15; // 마지막만 있고 예측 없음 — 왼쪽 가까이
  }

  // 현재 포인트 색상 — 긴박도에 따라
  const currentDotColor =
    overdue ? '#ef4444'
    : currentPct != null && currentPct > 75 ? '#f59e0b'
    : '#22c55e';

  const dateLabel = ec ? (() => {
    const t = new Date(ec.date);
    return `${t.getMonth() + 1}/${t.getDate()}`;
  })() : null;
  const daysLabel = ec ? (ec.days_until === 0 ? '곧' : `${ec.days_until}일 후`) : null;
  const thresholdLabel = ec
    ? (ec.threshold_source === 'learned' ? `${ec.threshold_pct}% 습관` : `${ec.threshold_pct}%`)
    : null;

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-4 pt-5 pb-4">
        {/* 타임라인 */}
        <div className="relative h-8 mx-7 mb-3">
          {/* 가로선 — 구간별 색상 (지남 영역은 emerald→amber, 앞으로 남은 영역은 zinc) */}
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] rounded-full bg-zinc-800 overflow-hidden">
            {currentPct != null && (
              <div
                className="h-full rounded-full"
                style={{
                  width: `${currentPct}%`,
                  background: overdue
                    ? 'linear-gradient(90deg, #10b981 0%, #ef4444 100%)'
                    : 'linear-gradient(90deg, #10b981 0%, #f59e0b 100%)',
                }}
              />
            )}
          </div>

          {/* 왼쪽 깃발 (마지막 충전) */}
          <div className="absolute -left-7 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center">
            <FlagIcon className="w-3.5 h-3.5 text-emerald-400" />
          </div>

          {/* 오른쪽 타겟 (예상 충전일) */}
          <div className={`absolute -right-7 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full border flex items-center justify-center ${
            ec ? 'bg-zinc-800 border-white/10' : 'bg-zinc-900 border-white/[0.04]'
          }`}>
            <TargetIcon className={`w-3.5 h-3.5 ${ec ? (overdue ? 'text-red-400' : 'text-amber-400') : 'text-zinc-700'}`} />
          </div>

          {/* 현재 포인트 */}
          {currentPct != null && (
            <div
              className="absolute top-1/2 w-3 h-3 rounded-full border-2 border-[#161618] pointer-events-none"
              style={{
                left: `${currentPct}%`,
                transform: 'translate(-50%, -50%)',
                background: currentDotColor,
                boxShadow: `0 0 8px ${currentDotColor}aa`,
              }}
              aria-label="현재 위치"
            />
          )}
        </div>

        {/* 하단 3열 라벨 */}
        <div className="grid grid-cols-3 gap-2 items-start">
          {/* 좌 — 마지막 충전 */}
          <div className="text-left">
            <p className="text-[10px] text-zinc-500 mb-0.5">마지막 충전</p>
            {lc ? (
              <>
                <p className="text-[13px] font-bold text-zinc-200 tabular-nums leading-tight">{elapsedLabel(lc.end_date)}</p>
                <p className="text-[10px] text-zinc-500 tabular-nums leading-tight mt-0.5">
                  {lc.location ? <span>{lc.location}</span> : null}
                  {lc.soc_start != null && lc.soc_end != null && (
                    <span className={lc.location ? 'ml-1' : ''}>{lc.soc_start}→{lc.soc_end}%</span>
                  )}
                </p>
              </>
            ) : <p className="text-xs text-zinc-700 tabular-nums">—</p>}
          </div>

          {/* 중 — 지금 */}
          <div className="text-center">
            <p className="text-[10px] mb-0.5" style={{ color: `${currentDotColor}cc` }}>지금</p>
            {car.battery_level != null ? (
              <p className="text-[13px] font-bold tabular-nums leading-tight" style={{ color: currentDotColor }}>
                {car.battery_level}%
              </p>
            ) : <p className="text-xs text-zinc-700">—</p>}
            {ec?.daily_consumption_pct != null && (
              <p className="text-[10px] text-zinc-500 tabular-nums leading-tight mt-0.5">
                일 {ec.daily_consumption_pct}%↓
              </p>
            )}
          </div>

          {/* 우 — 추천 충전일 */}
          <div className="text-right">
            <p className="text-[10px] text-zinc-500 mb-0.5">추천 충전일 (예상)</p>
            {ec ? (
              <>
                <p className={`text-[13px] font-bold tabular-nums leading-tight ${overdue ? 'text-red-400' : 'text-amber-400'}`}>
                  {daysLabel}
                </p>
                <p className="text-[10px] text-zinc-500 tabular-nums leading-tight mt-0.5">
                  {dateLabel} · {thresholdLabel}
                </p>
              </>
            ) : <p className="text-xs text-zinc-700 tabular-nums">—</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
