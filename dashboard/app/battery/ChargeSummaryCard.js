'use client';

import { useEffect, useState } from 'react';

function elapsedShort(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}시간 전`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return '어제';
  return `${diffD}일 전`;
}

// 수정된 계획 C: 배터리 위에 3개 마커 (5일뒤/지금/어제)
// SoC 축 기준 → 낮은%(미래,좌) ← 현재 ← 높은%(과거,우)
// 시간은 우→좌로 흐름 (드레인 방향)
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
  const lastSoc = lc?.soc_end ?? null;

  const overdue = threshold != null && soc != null && soc <= threshold;
  const urgent = !overdue && ec?.days_until != null && ec.days_until <= 1;

  const stableColor  = overdue ? '#ef4444' : urgent ? '#f59e0b' : '#10b981';
  const stableLight  = overdue ? '#f87171' : urgent ? '#fbbf24' : '#34d399';
  const accentColor  = overdue ? '#ef4444' : '#f59e0b';

  const daysLabel = ec ? (ec.days_until === 0 ? '곧' : `${ec.days_until}일 뒤`) : null;

  // SVG 기하
  const VIEW_W = 320;
  const VIEW_H = 72;
  const PAD_X = 4;
  const TERM_W = 6;
  const BATT_X = PAD_X;
  const BATT_Y = 32;             // 위쪽 라벨 공간
  const BATT_W = VIEW_W - PAD_X * 2 - TERM_W;
  const BATT_H = 36;
  const BATT_RX = 8;

  const INNER_PAD = 3;
  const INNER_X = BATT_X + INNER_PAD;
  const INNER_Y = BATT_Y + INNER_PAD;
  const INNER_W = BATT_W - INNER_PAD * 2;
  const INNER_H = BATT_H - INNER_PAD * 2;

  const fillEdgeX = INNER_X + (INNER_W * socPct) / 100;
  const thresholdX = threshold != null ? INNER_X + (INNER_W * threshold) / 100 : null;
  const lastSocX = lastSoc != null ? INNER_X + (INNER_W * lastSoc) / 100 : null;
  const predictRegionW = thresholdX != null ? Math.max(0, fillEdgeX - thresholdX) : 0;

  // 텍스트 앵커 — 가장자리 근처면 start/end, 가운데면 middle
  const anchorFor = (x) => {
    if (x == null) return 'middle';
    if (x < 24) return 'start';
    if (x > VIEW_W - 24) return 'end';
    return 'middle';
  };
  const clampX = (x) => {
    if (x == null) return 0;
    return Math.max(2, Math.min(VIEW_W - 2, x));
  };

  const Y_TIME = 10;
  const Y_PCT  = 22;

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-3">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full h-auto block"
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient
            id="predictGrad"
            gradientUnits="userSpaceOnUse"
            x1={thresholdX ?? 0} y1={0}
            x2={fillEdgeX} y2={0}
          >
            <stop offset="0%" stopColor={stableColor} stopOpacity="0.85" />
            <stop offset="100%" stopColor={stableLight} stopOpacity="0.15" />
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

        {/* ── 배터리 위 3개 마커 ── */}

        {/* 예상 충전일 (좌 · 낮은 SoC) */}
        {ec && thresholdX != null && (
          <g className={overdue || urgent ? 'charge-pulse' : ''}
             style={{ color: accentColor }}>
            <text
              x={clampX(thresholdX)}
              y={Y_TIME}
              textAnchor={anchorFor(thresholdX)}
              fontSize="11"
              fontWeight="700"
              fill={accentColor}
              style={{ fontFeatureSettings: '"tnum"' }}
            >
              ⚡ {daysLabel}
            </text>
            <text
              x={clampX(thresholdX)}
              y={Y_PCT}
              textAnchor={anchorFor(thresholdX)}
              fontSize="10"
              fill="#a1a1aa"
              style={{ fontFeatureSettings: '"tnum"' }}
            >
              {threshold}%
            </text>
          </g>
        )}

        {/* 지금 (중앙 · 현재 SoC) */}
        {soc != null && (
          <>
            <text
              x={clampX(fillEdgeX)}
              y={Y_TIME}
              textAnchor={anchorFor(fillEdgeX)}
              fontSize="10"
              fill="#a1a1aa"
            >
              지금
            </text>
            <text
              x={clampX(fillEdgeX)}
              y={Y_PCT}
              textAnchor={anchorFor(fillEdgeX)}
              fontSize="11"
              fontWeight="700"
              fill="#e4e4e7"
              style={{ fontFeatureSettings: '"tnum"' }}
            >
              {socPct}%
            </text>
          </>
        )}

        {/* 마지막 충전 (우 · 높은 SoC) */}
        {lc && lastSocX != null && (
          <>
            <text
              x={clampX(lastSocX)}
              y={Y_TIME}
              textAnchor={anchorFor(lastSocX)}
              fontSize="10"
              fill="#a1a1aa"
            >
              🏁 {elapsedShort(lc.end_date)}
            </text>
            <text
              x={clampX(lastSocX)}
              y={Y_PCT}
              textAnchor={anchorFor(lastSocX)}
              fontSize="10"
              fontWeight="700"
              fill="#34d399"
              style={{ fontFeatureSettings: '"tnum"' }}
            >
              {lastSoc}%
            </text>
          </>
        )}

        {/* ── 배터리 본체 ── */}
        <rect
          x={BATT_X} y={BATT_Y}
          width={BATT_W} height={BATT_H}
          rx={BATT_RX}
          fill="rgba(255,255,255,0.02)"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth="1.2"
        />
        <rect
          x={BATT_X + BATT_W}
          y={BATT_Y + (BATT_H - 14) / 2}
          width={TERM_W}
          height={14}
          rx="1.5"
          fill="rgba(255,255,255,0.12)"
        />

        {/* 내부 */}
        <g clipPath="url(#battInner)">
          {thresholdX != null && thresholdX > INNER_X && (
            <rect
              x={INNER_X} y={INNER_Y}
              width={thresholdX - INNER_X} height={INNER_H}
              fill={stableColor}
              opacity="0.92"
            />
          )}
          {thresholdX != null && predictRegionW > 0 && (
            <rect
              className="predict-shimmer"
              x={thresholdX} y={INNER_Y}
              width={predictRegionW} height={INNER_H}
              fill="url(#predictGrad)"
            />
          )}
          {thresholdX == null && fillEdgeX > INNER_X && (
            <rect
              x={INNER_X} y={INNER_Y}
              width={fillEdgeX - INNER_X} height={INNER_H}
              fill={stableColor}
              opacity="0.85"
            />
          )}
          {fillEdgeX > INNER_X && (
            <rect
              x={INNER_X} y={INNER_Y}
              width={fillEdgeX - INNER_X} height={INNER_H * 0.45}
              fill="url(#glossGrad)"
            />
          )}
          {/* 임계선 */}
          {thresholdX != null && (
            <line
              x1={thresholdX} y1={INNER_Y - 2}
              x2={thresholdX} y2={INNER_Y + INNER_H + 2}
              stroke={overdue ? 'rgba(239,68,68,0.8)' : 'rgba(255,255,255,0.45)'}
              strokeWidth="1"
              strokeDasharray="3 2"
            />
          )}
          {/* 마지막 충전 SoC 마커 (안쪽 얇은 세로선) */}
          {lastSocX != null && lastSocX > INNER_X && lastSocX < INNER_X + INNER_W && (
            <line
              x1={lastSocX} y1={INNER_Y - 2}
              x2={lastSocX} y2={INNER_Y + INNER_H + 2}
              stroke="#34d399"
              strokeOpacity="0.5"
              strokeWidth="1"
              strokeDasharray="1 2"
            />
          )}
          {/* NOW 수직선 + 펄스 도트 */}
          {soc != null && (
            <>
              <line
                x1={fillEdgeX} y1={INNER_Y}
                x2={fillEdgeX} y2={INNER_Y + INNER_H}
                stroke="#ffffff"
                strokeOpacity="0.9"
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

        {/* 드레인 방향 힌트 (배터리 위 가로 화살표, 우→좌) */}
        {ec && thresholdX != null && (
          <g opacity="0.3">
            <line
              x1={fillEdgeX - 6} y1={BATT_Y - 4}
              x2={thresholdX + 6} y2={BATT_Y - 4}
              stroke="#71717a"
              strokeWidth="0.8"
              strokeDasharray="1 2"
            />
            <path
              d={`M ${thresholdX + 8} ${BATT_Y - 6} L ${thresholdX + 4} ${BATT_Y - 4} L ${thresholdX + 8} ${BATT_Y - 2} Z`}
              fill="#71717a"
            />
          </g>
        )}
      </svg>
    </div>
  );
}
