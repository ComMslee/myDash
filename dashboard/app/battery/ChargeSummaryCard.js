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

function BoltIcon({ className, style }) {
  return (
    <svg className={className} style={style} fill="currentColor" viewBox="0 0 24 24">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

// 가로 배터리 히어로 — 좌측 수위가 현재 SoC, 점선은 충전 임계값,
// 우측 터미널 쪽으로 수위가 줄어드는 상상으로 "다음 충전일" 예측.
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
  const soc = car.battery_level;
  const threshold = ec?.threshold_pct ?? null;
  const socPct = soc != null ? Math.max(0, Math.min(100, soc)) : 0;

  const overdue = threshold != null && soc != null && soc <= threshold;
  const urgent = !overdue && ec?.days_until != null && ec.days_until <= 1;

  // 수위 그라디언트: 구간별로 색 다르게
  const fillStart = overdue ? '#ef4444' : urgent ? '#f59e0b' : '#10b981';
  const fillEnd   = overdue ? '#f87171' : urgent ? '#fbbf24' : '#34d399';
  const accentColor = overdue ? '#ef4444' : '#f59e0b';

  const dateLabel = ec ? (() => {
    const t = new Date(ec.date);
    return `${t.getMonth() + 1}/${t.getDate()}`;
  })() : null;
  const daysLabel = ec ? (ec.days_until === 0 ? '곧' : `D-${ec.days_until}`) : null;

  // SVG 기하
  const VIEW_W = 320;
  const VIEW_H = 86;
  const PAD_X = 4;
  const TERM_W = 6;
  const BATT_X = PAD_X;
  const BATT_Y = 16;
  const BATT_W = VIEW_W - PAD_X * 2 - TERM_W;
  const BATT_H = 52;
  const BATT_RX = 10;

  const INNER_PAD = 4;
  const INNER_X = BATT_X + INNER_PAD;
  const INNER_Y = BATT_Y + INNER_PAD;
  const INNER_W = BATT_W - INNER_PAD * 2;
  const INNER_H = BATT_H - INNER_PAD * 2;

  const fillW = (INNER_W * socPct) / 100;
  const fillEdgeX = INNER_X + fillW;
  const thresholdX = threshold != null ? INNER_X + (INNER_W * threshold) / 100 : null;

  const LABEL_Y = BATT_Y + BATT_H + 14;
  const socLabelX = Math.max(INNER_X + 14, Math.min(INNER_X + INNER_W - 14, fillEdgeX));

  // 라벨 겹침 방지: 임계값과 현재 라벨이 너무 가까우면 임계 라벨 숨김
  const hideThresholdLabel = thresholdX != null && Math.abs(socLabelX - thresholdX) < 28;

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-5 py-4">
      {/* 상단: 좌(마지막 충전) · 우(다음 충전 예측) */}
      <div className="flex justify-between items-center mb-1 min-h-[22px] gap-3">
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
        <div className="flex items-center gap-1.5 shrink-0">
          {ec ? (
            <>
              <div className="text-right leading-tight">
                <span
                  className="text-[13px] font-bold tabular-nums"
                  style={{ color: accentColor }}
                >
                  {daysLabel}
                </span>
                <span className="text-[11px] text-zinc-500 tabular-nums ml-1.5">
                  {dateLabel}
                </span>
              </div>
              <BoltIcon
                className={`w-3.5 h-3.5 shrink-0 ${overdue || urgent ? 'charge-pulse' : ''}`}
                style={{ color: accentColor }}
              />
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
          <linearGradient id="socGrad" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor={fillStart} stopOpacity="0.95" />
            <stop offset="100%" stopColor={fillEnd} stopOpacity="0.95" />
          </linearGradient>
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
          y={BATT_Y + (BATT_H - 22) / 2}
          width={TERM_W}
          height={22}
          rx="1.5"
          fill="rgba(255,255,255,0.12)"
        />

        {/* 내부: 채움 + 물결 + 임계선 */}
        <g clipPath="url(#battInner)">
          {fillW > 0 && (
            <>
              <rect
                x={INNER_X} y={INNER_Y}
                width={fillW} height={INNER_H}
                fill="url(#socGrad)"
              />
              {/* 수위 우측 물결 — 상하 미세 진동 */}
              <g className="wave-bob" style={{ color: fillEnd }}>
                <path
                  d={`
                    M ${fillEdgeX - 7} ${INNER_Y - 2}
                    C ${fillEdgeX - 3} ${INNER_Y + 3},
                      ${fillEdgeX + 1} ${INNER_Y - 3},
                      ${fillEdgeX + 5} ${INNER_Y + 2}
                    L ${fillEdgeX + 5} ${INNER_Y + INNER_H + 2}
                    L ${fillEdgeX - 7} ${INNER_Y + INNER_H + 2}
                    Z
                  `}
                  fill="currentColor"
                  opacity="0.55"
                />
              </g>
              {/* 상단 광택 */}
              <rect
                x={INNER_X} y={INNER_Y}
                width={fillW} height={INNER_H * 0.45}
                fill="url(#glossGrad)"
              />
            </>
          )}

          {/* 임계선 */}
          {thresholdX != null && (
            <line
              x1={thresholdX} y1={INNER_Y - 2}
              x2={thresholdX} y2={INNER_Y + INNER_H + 2}
              stroke={overdue ? 'rgba(239,68,68,0.7)' : 'rgba(255,255,255,0.4)'}
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}
        </g>

        {/* 하단 라벨: 임계값 */}
        {thresholdX != null && !hideThresholdLabel && (
          <text
            x={thresholdX}
            y={LABEL_Y}
            textAnchor="middle"
            fontSize="10"
            fill="#71717a"
            style={{ fontFeatureSettings: '"tnum"' }}
          >
            ↑{threshold}%{ec?.threshold_source === 'learned' ? ' 습관' : ''}
          </text>
        )}

        {/* 하단 라벨: 현재 SoC */}
        {soc != null && (
          <text
            x={socLabelX}
            y={LABEL_Y}
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill="#e4e4e7"
            style={{ fontFeatureSettings: '"tnum"' }}
          >
            ↑{socPct}%
          </text>
        )}
      </svg>
    </div>
  );
}
