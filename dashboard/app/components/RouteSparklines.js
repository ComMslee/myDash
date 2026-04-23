'use client';

import { useMemo, useRef } from 'react';

const W = 400;
const ROW_H = 24;
const PAD_X = 8;
const PAD_Y = 3;

function formatHM(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// routes: [{ positions: [{speed, elev, temp, date}], startDate? }]
// selectedIdx: 전체 flat 배열 기준 인덱스 (null 가능)
// onSelect: (idx) => void
export default function RouteSparklines({ routes, selectedIdx, onSelect }) {
  const svgRef = useRef(null);

  const { flat, boundaries, labels } = useMemo(() => {
    const flat = [];
    const boundaries = [];
    const labels = [];
    let idx = 0;
    let lastColor = null;
    (routes || []).forEach((r, di) => {
      const pos = r?.positions;
      if (!pos || pos.length === 0) return;
      if (idx > 0) boundaries.push(idx);
      // 지도 배지와 동일 — 첫 주행=S, 나머지=주행번호(1, 2, ...)
      labels.push({ atIdx: idx, label: di === 0 ? 'S' : String(di), color: r.color || '#71717a' });
      for (const p of pos) {
        flat.push({ speed: p.speed, elev: p.elev, temp: p.temp, driveIdx: di });
        idx++;
      }
      lastColor = r.color || '#71717a';
    });
    // 마지막 주행의 종료 지점 E 마커
    if (labels.length > 0 && idx > 0) {
      labels.push({ atIdx: idx - 1, label: 'E', color: lastColor });
    }
    return { flat, boundaries, labels };
  }, [routes]);

  const n = flat.length;
  if (n < 2) return null;

  const xOf = (i) => PAD_X + (i / (n - 1)) * (W - 2 * PAD_X);

  const buildRow = (key) => {
    const vals = flat.map(f => f[key]);
    const present = vals.map((v, i) => (v != null ? { i, v } : null)).filter(Boolean);
    if (present.length < 2) return { d: '', yOf: null, min: null, max: null };
    const min = Math.min(...present.map(p => p.v));
    const max = Math.max(...present.map(p => p.v));
    const range = max - min || 1;
    const yOf = (v) => PAD_Y + (1 - (v - min) / range) * (ROW_H - 2 * PAD_Y);
    let d = '';
    let prevDrive = -1;
    for (let i = 0; i < n; i++) {
      const v = flat[i][key];
      if (v == null) continue;
      const x = xOf(i).toFixed(1);
      const y = yOf(v).toFixed(1);
      if (flat[i].driveIdx !== prevDrive) {
        d += `M${x},${y}`;
        prevDrive = flat[i].driveIdx;
      } else {
        d += `L${x},${y}`;
      }
    }
    return { d, yOf, min, max };
  };

  const speed = buildRow('speed');
  const elev  = buildRow('elev');
  const temp  = buildRow('temp');

  const speedVals = flat.map(f => f.speed).filter(v => v != null);
  const maxSpeed = speedVals.length ? Math.round(Math.max(...speedVals)) : null;
  const avgSpeed = speedVals.length ? Math.round(speedVals.reduce((s, v) => s + v, 0) / speedVals.length) : null;

  const elevVals = flat.map(f => f.elev).filter(v => v != null);
  const minElev = elevVals.length ? Math.round(Math.min(...elevVals)) : null;
  const maxElev = elevVals.length ? Math.round(Math.max(...elevVals)) : null;
  const avgElev = elevVals.length ? Math.round(elevVals.reduce((s, v) => s + v, 0) / elevVals.length) : null;
  let elevGain = null;
  if (elevVals.length >= 2) {
    elevGain = Math.round(elevVals[elevVals.length - 1] - elevVals[0]);
  }

  const tempVals = flat.map(f => f.temp).filter(v => v != null);
  const minTemp = tempVals.length ? Math.round(Math.min(...tempVals)) : null;
  const maxTemp = tempVals.length ? Math.round(Math.max(...tempVals)) : null;
  const avgTemp = tempVals.length ? Math.round(tempVals.reduce((s, v) => s + v, 0) / tempVals.length) : null;

  const handlePointer = (e) => {
    if (!onSelect || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const targetX = PAD_X + ratio * (W - 2 * PAD_X);
    let bestI = 0, bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(xOf(i) - targetX);
      if (d < bestDist) { bestDist = d; bestI = i; }
    }
    onSelect(bestI);
  };

  const hasSel = selectedIdx != null && selectedIdx >= 0 && selectedIdx < n;
  const selX = hasSel ? xOf(selectedIdx) : null;

  // 선택 idx에 해당 key 값이 null이면 같은 drive 내 앞/뒤 non-null 샘플로 선형 보간
  // (sparkline 라인이 실제로 그려진 위치와 값이 일치하게)
  const interpAt = (idx, key) => {
    if (!hasSel) return null;
    const row = flat[idx];
    if (!row) return null;
    if (row[key] != null) return row[key];
    const di = row.driveIdx;
    let L = -1, R = -1;
    for (let i = idx - 1; i >= 0; i--) {
      if (flat[i].driveIdx !== di) break;
      if (flat[i][key] != null) { L = i; break; }
    }
    for (let i = idx + 1; i < n; i++) {
      if (flat[i].driveIdx !== di) break;
      if (flat[i][key] != null) { R = i; break; }
    }
    if (L < 0 && R < 0) return null;
    if (L < 0) return flat[R][key];
    if (R < 0) return flat[L][key];
    const t = (idx - L) / (R - L);
    return flat[L][key] + (flat[R][key] - flat[L][key]) * t;
  };

  const selSpeedVal = hasSel ? interpAt(selectedIdx, 'speed') : null;
  const selElevVal  = hasSel ? interpAt(selectedIdx, 'elev')  : null;
  const selTempVal  = hasSel ? interpAt(selectedIdx, 'temp')  : null;
  const totalH = ROW_H * 3;

  // 시간 라벨 엣지 클램프 — 첫/끝(인덱스) 또는 극단 ratio 라벨은 컨테이너 가장자리에 밀착
  const labelAlign = (ratio, idx, total) => {
    if (idx === 0 || ratio < 0.05) return { left: 0, right: 'auto', transform: 'translateX(0)' };
    if (idx === total - 1 || ratio > 0.95) return { left: 'auto', right: 0, transform: 'translateX(0)' };
    return { left: `${ratio * 100}%`, right: 'auto', transform: 'translateX(-50%)' };
  };

  const renderRow = (row, color, rowIdx) => {
    const y0 = ROW_H * rowIdx;
    return (
      <g key={rowIdx} transform={`translate(0,${y0})`}>
        {/* 행 배경 틴트 */}
        <rect x={0} y={0} width={W} height={ROW_H} fill={color} opacity={0.05} />
        {/* 행 상단 구분선 */}
        {rowIdx > 0 && <line x1={0} y1={0} x2={W} y2={0} stroke="#27272a" strokeWidth={0.5} />}
        {/* 라인 */}
        <path d={row.d} stroke={color} strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
      </g>
    );
  };

  // 요약 포맷
  // 선택X: 속도=평균(최고), 고도=±순증감(범위), 온도=평균(범위)
  // 선택: 평균 > 선택값 (3행 모두 동일 패턴)
  const rowSummary = (key) => {
    let defA = null, defRange = null, selCenter = null, selValTxt = null, unit = null;
    if (key === 'speed') {
      if (avgSpeed == null) return null;
      defA = avgSpeed;
      defRange = maxSpeed != null ? String(maxSpeed) : null;
      selCenter = avgSpeed;
      unit = 'km/h';
      if (selSpeedVal != null) selValTxt = Math.round(selSpeedVal);
    } else if (key === 'elev') {
      if (elevGain == null && avgElev == null) return null;
      defA = elevGain != null ? `${elevGain >= 0 ? '+' : ''}${elevGain}` : String(avgElev);
      defRange = (minElev != null && maxElev != null) ? `${minElev}~${maxElev}` : null;
      selCenter = avgElev;
      unit = 'm';
      if (selElevVal != null) selValTxt = Math.round(selElevVal);
    } else { // temp
      if (avgTemp == null) return null;
      defA = avgTemp;
      defRange = (minTemp != null && maxTemp != null)
        ? (minTemp === maxTemp ? null : `${minTemp}~${maxTemp}`)
        : null;
      selCenter = avgTemp;
      unit = '°C';
      if (selTempVal != null) selValTxt = (Math.round(selTempVal * 10) / 10).toFixed(1);
    }

    if (selValTxt != null) {
      return (
        <span className="text-zinc-500">
          {selCenter}
          <span className="text-zinc-600 mx-1">→</span>
          <span className="text-fuchsia-400 font-semibold">{selValTxt}</span>
          <span className="text-zinc-600">{unit}</span>
        </span>
      );
    }
    return (
      <span className="text-zinc-500">
        {defA}
        {defRange && <span className="text-zinc-600">({defRange})</span>}
        <span className="text-zinc-600">{unit}</span>
      </span>
    );
  };

  return (
    <div className="px-3 pt-2 pb-2 border-t border-white/[0.04] flex items-start gap-2">
      {/* 좌: 이모지 */}
      <div className="flex flex-col flex-shrink-0 text-[11px] leading-none">
        <span className="text-sky-400 flex items-center" style={{ height: ROW_H }}>🚗</span>
        <span className="text-lime-400 flex items-center" style={{ height: ROW_H }}>⛰</span>
        <span className="text-orange-400 flex items-center" style={{ height: ROW_H }}>🌡</span>
      </div>

      {/* 중: 그래프 + 시간축 */}
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
          {renderRow(speed, '#38bdf8', 0)}
          {renderRow(elev,  '#a3e635', 1)}
          {renderRow(temp,  '#fb923c', 2)}

          {boundaries.map((bi, k) => {
            const x = xOf(bi);
            return (
              <line key={`b${k}`} x1={x} y1={0} x2={x} y2={totalH}
                stroke="#71717a" strokeWidth={0.8} strokeDasharray="2 2" opacity={0.7} />
            );
          })}

          {hasSel && (
            <>
              <line x1={selX} y1={0} x2={selX} y2={totalH}
                stroke="#e879f9" strokeWidth={1} strokeDasharray="2 3" opacity={0.8} />
              {selSpeedVal != null && speed.yOf && (
                <circle cx={selX} cy={speed.yOf(selSpeedVal)} r={2.5} fill="#e879f9" />
              )}
              {selElevVal != null && elev.yOf && (
                <circle cx={selX} cy={ROW_H + elev.yOf(selElevVal)} r={2.5} fill="#e879f9" />
              )}
              {selTempVal != null && temp.yOf && (
                <circle cx={selX} cy={ROW_H * 2 + temp.yOf(selTempVal)} r={2.5} fill="#e879f9" />
              )}
            </>
          )}
        </svg>

        {labels.length > 2 && (
          <div className="mt-1 relative h-4">
            {labels.map((lbl, i) => {
              const ratio = lbl.atIdx / (n - 1);
              return (
                <span
                  key={i}
                  className="absolute inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px] font-bold text-white leading-none shadow"
                  style={{ backgroundColor: lbl.color, ...labelAlign(ratio, i, labels.length) }}
                >
                  {lbl.label}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* 우: 요약/선택값 */}
      <div className="flex flex-col flex-shrink-0 text-[10px] tabular-nums text-right whitespace-nowrap" style={{ width: 140 }}>
        <span className="flex items-center justify-end" style={{ height: ROW_H }}>{rowSummary('speed')}</span>
        <span className="flex items-center justify-end" style={{ height: ROW_H }}>{rowSummary('elev')}</span>
        <span className="flex items-center justify-end" style={{ height: ROW_H }}>{rowSummary('temp')}</span>
      </div>
    </div>
  );
}
