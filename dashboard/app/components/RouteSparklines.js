'use client';

import { useMemo, useRef } from 'react';

const W = 400;
const ROW_H = 24;
const PAD_X = 8;
const PAD_Y = 3;

// 3행 지표 설정 — 순서 = 표시 순서
const METRICS = [
  { key: 'speed', color: '#38bdf8', unit: 'km/h', emoji: '🚗', emojiClass: 'text-sky-400',   fmtSel: v => `${Math.round(v)}` },
  { key: 'elev',  color: '#a3e635', unit: 'm',    emoji: '⛰', emojiClass: 'text-lime-400',  fmtSel: v => `${Math.round(v)}` },
  { key: 'temp',  color: '#fb923c', unit: '°C',   emoji: '🌡', emojiClass: 'text-orange-400', fmtSel: v => (Math.round(v * 10) / 10).toFixed(1) },
];

function computeStats(vals) {
  if (!vals.length) return { min: null, max: null, avg: null };
  return {
    min: Math.round(Math.min(...vals)),
    max: Math.round(Math.max(...vals)),
    avg: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
  };
}

// routes: [{ positions: [{speed, elev, temp}], color?, startDate? }]
// selectedIdx: 전체 flat 기준 인덱스 (null 가능)
// onSelect: (idx) => void
export default function RouteSparklines({ routes, selectedIdx, onSelect }) {
  const svgRef = useRef(null);

  // 1) 모든 routes를 flat + drive 경계 + 상/하단 배지 라벨로 평탄화
  const { flat, boundaries, labels } = useMemo(() => {
    const flat = [];
    const boundaries = [];
    const labels = [];
    let idx = 0;
    let lastColor = '#71717a';
    (routes || []).forEach((r, di) => {
      const pos = r?.positions;
      if (!pos || pos.length === 0) return;
      const color = r.color || '#71717a';
      if (idx > 0) boundaries.push(idx);
      labels.push({ atIdx: idx, label: di === 0 ? 'S' : String(di), color });
      for (const p of pos) {
        flat.push({ speed: p.speed, elev: p.elev, temp: p.temp, driveIdx: di });
        idx++;
      }
      lastColor = color;
    });
    if (idx > 0) labels.push({ atIdx: idx - 1, label: 'E', color: lastColor });
    return { flat, boundaries, labels };
  }, [routes]);

  const n = flat.length;

  // 2) 지표별 path + stats 준비 (n<2면 null path)
  const rows = useMemo(() => {
    return METRICS.map(({ key }) => {
      const vals = flat.reduce((a, f) => { if (f[key] != null) a.push(f[key]); return a; }, []);
      const { min, max, avg } = computeStats(vals);
      const range = (max - min) || 1;
      const yOf = max == null ? null : (v) => PAD_Y + (1 - (v - min) / range) * (ROW_H - 2 * PAD_Y);
      const xOf = (i) => PAD_X + (i / (n - 1)) * (W - 2 * PAD_X);
      let d = '';
      if (yOf && n >= 2) {
        let prevDrive = -1;
        for (let i = 0; i < n; i++) {
          const v = flat[i][key];
          if (v == null) continue;
          const cmd = flat[i].driveIdx !== prevDrive ? 'M' : 'L';
          d += `${cmd}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`;
          prevDrive = flat[i].driveIdx;
        }
      }
      return { key, d, yOf, min, max, avg };
    });
  }, [flat, n]);

  if (n < 2) return null;
  const totalH = ROW_H * METRICS.length;
  const xOf = (i) => PAD_X + (i / (n - 1)) * (W - 2 * PAD_X);

  // 3) 고도 순증감 (첫~끝) — 고도 기본 요약용
  const elevGain = (() => {
    const vals = flat.reduce((a, f) => { if (f.elev != null) a.push(f.elev); return a; }, []);
    return vals.length >= 2 ? Math.round(vals[vals.length - 1] - vals[0]) : null;
  })();

  // 4) 선택 인덱스의 값 — null이면 같은 drive 내 non-null 이웃으로 선형보간
  const interpAt = (idx, key) => {
    const row = flat[idx];
    if (!row) return null;
    if (row[key] != null) return row[key];
    const di = row.driveIdx;
    let L = -1, R = -1;
    for (let i = idx - 1; i >= 0 && flat[i].driveIdx === di; i--) if (flat[i][key] != null) { L = i; break; }
    for (let i = idx + 1; i < n  && flat[i].driveIdx === di; i++) if (flat[i][key] != null) { R = i; break; }
    if (L < 0 && R < 0) return null;
    if (L < 0) return flat[R][key];
    if (R < 0) return flat[L][key];
    return flat[L][key] + (flat[R][key] - flat[L][key]) * ((idx - L) / (R - L));
  };

  const hasSel = selectedIdx != null && selectedIdx >= 0 && selectedIdx < n;
  const selVals = hasSel
    ? Object.fromEntries(METRICS.map(m => [m.key, interpAt(selectedIdx, m.key)]))
    : {};
  const selX = hasSel ? xOf(selectedIdx) : null;

  // 5) SVG 포인터 스크럽 → 가장 가까운 인덱스
  const handlePointer = (e) => {
    if (!onSelect || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const targetX = PAD_X + ratio * (W - 2 * PAD_X);
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(xOf(i) - targetX);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    onSelect(best);
  };

  // 6) 시간 라벨(배지) 엣지 클램프 — 첫/끝 또는 극단 ratio는 가장자리 밀착
  const labelAlign = (ratio, idx, total) => {
    if (idx === 0 || ratio < 0.05) return { left: 0, right: 'auto', transform: 'translateX(0)' };
    if (idx === total - 1 || ratio > 0.95) return { left: 'auto', right: 0, transform: 'translateX(0)' };
    return { left: `${ratio * 100}%`, right: 'auto', transform: 'translateX(-50%)' };
  };

  // 7) 우측 요약 셀
  // 기본: 속도=avg(max), 고도=±gain(min~max), 온도=avg(min~max)
  // 선택: avg → 선택값
  const rowSummary = (row) => {
    if (row.avg == null) return null;
    const meta = METRICS.find(m => m.key === row.key);
    const selV = selVals[row.key];

    if (selV != null) {
      return (
        <span className="text-zinc-500">
          {row.avg}
          <span className="text-zinc-600 mx-1">→</span>
          <span className="text-fuchsia-400 font-semibold">{meta.fmtSel(selV)}</span>
          <span className="text-zinc-600">{meta.unit}</span>
        </span>
      );
    }

    const defA = row.key === 'elev' && elevGain != null
      ? `${elevGain >= 0 ? '+' : ''}${elevGain}`
      : row.avg;
    const defRange = row.key === 'speed'
      ? String(row.max)
      : (row.min === row.max ? null : `${row.min}~${row.max}`);

    return (
      <span className="text-zinc-500">
        {defA}
        {defRange && <span className="text-zinc-600">({defRange})</span>}
        <span className="text-zinc-600">{meta.unit}</span>
      </span>
    );
  };

  return (
    <div className="px-3 pt-2 pb-2 border-t border-white/[0.04] flex items-start gap-2">
      {/* 좌: 이모지 */}
      <div className="flex flex-col flex-shrink-0 text-[11px] leading-none">
        {METRICS.map(m => (
          <span key={m.key} className={`${m.emojiClass} flex items-center`} style={{ height: ROW_H }}>
            {m.emoji}
          </span>
        ))}
      </div>

      {/* 중: 그래프 + 하단 배지 */}
      <div className="flex-1 min-w-0">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${totalH}`}
          preserveAspectRatio="none"
          className="w-full block touch-none select-none cursor-crosshair"
          style={{ height: `${totalH}px` }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); handlePointer(e); }}
          onPointerMove={(e) => { if (e.buttons) handlePointer(e); }}
        >
          {rows.map((row, rowIdx) => {
            const color = METRICS[rowIdx].color;
            const y0 = ROW_H * rowIdx;
            return (
              <g key={row.key} transform={`translate(0,${y0})`}>
                <rect x={0} y={0} width={W} height={ROW_H} fill={color} opacity={0.05} />
                {rowIdx > 0 && <line x1={0} y1={0} x2={W} y2={0} stroke="#27272a" strokeWidth={0.5} />}
                <path d={row.d} stroke={color} strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}

          {boundaries.map((bi, k) => (
            <line key={`b${k}`} x1={xOf(bi)} y1={0} x2={xOf(bi)} y2={totalH}
              stroke="#71717a" strokeWidth={0.8} strokeDasharray="2 2" opacity={0.7} />
          ))}

          {hasSel && (
            <>
              <line x1={selX} y1={0} x2={selX} y2={totalH}
                stroke="#e879f9" strokeWidth={1} strokeDasharray="2 3" opacity={0.8} />
              {rows.map((row, rowIdx) => {
                const v = selVals[row.key];
                if (v == null || !row.yOf) return null;
                return (
                  <circle key={row.key}
                    cx={selX} cy={ROW_H * rowIdx + row.yOf(v)}
                    r={2.5} fill="#e879f9" />
                );
              })}
            </>
          )}
        </svg>

        {labels.length > 2 && (
          <div className="mt-1 relative h-4">
            {labels.map((lbl, i) => (
              <span
                key={i}
                className="absolute inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px] font-bold text-white leading-none shadow"
                style={{ backgroundColor: lbl.color, ...labelAlign(lbl.atIdx / (n - 1), i, labels.length) }}
              >
                {lbl.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 우: 요약/선택값 */}
      <div className="flex flex-col flex-shrink-0 text-[10px] tabular-nums text-right whitespace-nowrap" style={{ width: 140 }}>
        {rows.map(row => (
          <span key={row.key} className="flex items-center justify-end" style={{ height: ROW_H }}>
            {rowSummary(row)}
          </span>
        ))}
      </div>
    </div>
  );
}
