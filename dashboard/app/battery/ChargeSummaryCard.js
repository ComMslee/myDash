'use client';

import { useEffect, useState } from 'react';

function elapsedLabel(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}시간 전`;
  return `${Math.floor(diffH / 24)}일 전`;
}

function FlagIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v18M5 4h11l-2 4 2 4H5" />
    </svg>
  );
}

// 가로 배터리 + 예측 드레인 페이드
// [0, threshold] 안정 구간은 solid, [threshold, SoC] 구간은 예측 드레인으로 페이드.
// 임계선에 ⚡ 아이콘, 현재 SoC에 NOW 펄스 도트.
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
  const soc = car.battery_level;
  const threshold = ec?.threshold_pct ?? null;
  const socPct = soc != null ? Math.max(0, Math.min(100, soc)) : 0;

  const overdue = threshold != null && soc != null && soc <= threshold;
  const urgent = !overdue && ec?.days_until != null && ec.days_until <= 1;

  const stableColor  = overdue ? '#ef4444' : urgent ? '#f59e0b' : '#10b981';
  const stableLight  = overdue ? '#f87171' : urgent ? '#fbbf24' : '#34d399';
  const accentColor  = overdue ? '#ef4444' : '#f59e0b';

  const dateLabel = ec ? (() => {
    const t = new Date(ec.date);
    return `${t.getMonth() + 1}/${t.getDate()}`;
  })() : null;
  const daysLabel = ec ? (ec.days_until === 0 ? '곧' : `D-${ec.days_until}`) : null;

  // SVG 기하 (컴팩트)
  const VIEW_W = 320;
  const VIEW_H = 70;
  const PAD_X = 4;
  const TERM_W = 6;
  const BATT_X = PAD_X;
  const BATT_Y = 12;
  const BATT_W = VIEW_W - PAD_X * 2 - TERM_W;
  const BATT_H = 40;
  const BATT_RX = 8;

  const INNER_PAD = 3;
  const INNER_X = BATT_X + INNER_PAD;
  const INNER_Y = BATT_Y + INNER_PAD;
  const INNER_W = BATT_W - INNER_PAD * 2;
  const INNER_H = BATT_H - INNER_PAD * 2;

  const fillEdgeX = INNER_X + (INNER_W * socPct) / 100;
  const thresholdX = threshold != null ? INNER_X + (INNER_W * threshold) / 100 : null;
  const predictRegionW = thresholdX != null ? Math.max(0, fillEdgeX - thresholdX) : 0;

  const LABEL_Y = BATT_Y + BATT_H + 12;
  const socLabelX = Math.max(INNER_X + 14, Math.min(INNER_X + INNER_W - 14, fillEdgeX));
  const hideThresholdLabel = thresholdX != null && Math.abs(socLabelX - thresholdX) < 32;

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-3">
      {/* 상단: 좌(마지막 충전) · 우(다음 충전 예측) */}
      <div className="flex justify-between items-center mb-1 min-h-[20px] gap-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <FlagIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          {lc ? (
            <div className="text-[11px] leading-tight truncate">
              <span className="text-zinc-300 tabular-nums">{elapsedLabel(lc.end_date)}</span>
              {lc.location && <span className="text-zinc-500 ml-1">· {lc.location}</span>}
            </div>
          ) : (
            <span className="text-[11px] text-zinc-600">—</span>
          )}
        </div>
        <div className="shrink-0 leading-tight">
          {ec ? (
            <>
              <span
                className="text-[13px] font-bold tabular-nums"
                style={{ color: accentColor }}
              >
                {daysLabel}
              </span>
              <span className="text-[11px] text-zinc-500 tabular-nums ml-1.5">
                {dateLabel}
              </span>
            </>
          ) : (
            <span className="text-[11px] text-zinc-600">—</span>
          )}
        </div>
      </div>

      {/* 배터리 SVG */}
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full h-auto block"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* 예측 드레인 구간: 임계선(진함) → 현재(연함) */}
          <linearGradient
            id="predictGrad"
            gradientUnits="userSpaceOnUse"
            x1={thresholdX ?? 0} y1={0}
            x2={fillEdgeX} y2={0}
          >
            <stop offset="0%" stopColor={stableColor} stopOpacity="0.85" />
            <stop offset="100%" stopColor={stableLight} stopOpacity="0.15" />
          </linearGradient>
          {/* 상단 미묘한 광택 */}
          <linearGradient id="glossGrad" x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.08" />
            <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <clipPath id="battInner">
            <rect
              x={INNER_X} y={INNER_Y}
              width={INNER_W} height={INNER_H}
              rx={BATT_RX - INNER_PAD}
            />
          </clipPath>
        </defs>

        {/* 배터리 본체 */}
        <rect
          x={BATT_X} y={BATT_Y}
          width={BATT_W} height={BATT_H}
          rx={BATT_RX}
          fill="rgba(255,255,255,0.02)"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth="1.2"
        />
        {/* 터미널 */}
        <rect
          x={BATT_X + BATT_W}
          y={BATT_Y + (BATT_H - 16) / 2}
          width={TERM_W}
          height={16}
          rx="1.5"
          fill="rgba(255,255,255,0.12)"
        />

        {/* 내부: 안정 + 예측 + 광택 + 임계선 + NOW */}
        <g clipPath="url(#battInner)">
          {/* 안정 구간 [0, threshold] — solid */}
          {thresholdX != null && thresholdX > INNER_X && (
            <rect
              x={INNER_X} y={INNER_Y}
              width={thresholdX - INNER_X} height={INNER_H}
              fill={stableColor}
              opacity="0.92"
            />
          )}

          {/* 예측 드레인 구간 [threshold, soc] — fade gradient */}
          {thresholdX != null && predictRegionW > 0 && (
            <rect
              className="predict-shimmer"
              x={thresholdX} y={INNER_Y}
              width={predictRegionW} height={INNER_H}
              fill="url(#predictGrad)"
            />
          )}

          {/* threshold 없을 때 fallback: 전체 solid */}
          {thresholdX == null && fillEdgeX > INNER_X && (
            <rect
              x={INNER_X} y={INNER_Y}
              width={fillEdgeX - INNER_X} height={INNER_H}
              fill={stableColor}
              opacity="0.85"
            />
          )}

          {/* 상단 광택 (전체 채움 위) */}
          {fillEdgeX > INNER_X && (
            <rect
              x={INNER_X} y={INNER_Y}
              width={fillEdgeX - INNER_X} height={INNER_H * 0.45}
              fill="url(#glossGrad)"
            />
          )}

          {/* 임계선 점선 */}
          {thresholdX != null && (
            <line
              x1={thresholdX} y1={INNER_Y - 2}
              x2={thresholdX} y2={INNER_Y + INNER_H + 2}
              stroke={overdue ? 'rgba(239,68,68,0.8)' : 'rgba(255,255,255,0.45)'}
              strokeWidth="1"
              strokeDasharray="3 2"
            />
          )}

          {/* NOW 수직선 + 펄스 도트 */}
          {soc != null && (
            <>
              <line
                x1={fillEdgeX} y1={INNER_Y}
                x2={fillEdgeX} y2={INNER_Y + INNER_H}
                stroke="#ffffff"
                strokeOpacity="0.85"
                strokeWidth="1.2"
              />
              <circle
                className="now-pulse"
                cx={fillEdgeX} cy={INNER_Y + INNER_H / 2}
                r="3"
                fill="#ffffff"
              />
            </>
          )}
        </g>

        {/* 임계선 아래 ⚡ 배지 */}
        {thresholdX != null && (
          <g transform={`translate(${thresholdX}, ${BATT_Y + BATT_H + 3})`}>
            <path
              className={overdue || urgent ? 'charge-pulse' : ''}
              d="M 1 -3 L -3 3 L 0 3 L -1 7 L 3 0 L 0 0 Z"
              fill={accentColor}
              style={{ color: accentColor }}
            />
          </g>
        )}

        {/* 하단 라벨: 임계값 */}
        {thresholdX != null && !hideThresholdLabel && (
          <text
            x={thresholdX + 7}
            y={LABEL_Y + 2}
            textAnchor="start"
            fontSize="9"
            fill="#71717a"
            style={{ fontFeatureSettings: '"tnum"' }}
          >
            {threshold}%{ec?.threshold_source === 'learned' ? '·습관' : ''}
          </text>
        )}

        {/* 하단 라벨: 현재 SoC */}
        {soc != null && (
          <text
            x={socLabelX}
            y={LABEL_Y}
            textAnchor="middle"
            fontSize="10"
            fontWeight="700"
            fill="#e4e4e7"
            style={{ fontFeatureSettings: '"tnum"' }}
          >
            {socPct}%
          </text>
        )}
      </svg>
    </div>
  );
}
