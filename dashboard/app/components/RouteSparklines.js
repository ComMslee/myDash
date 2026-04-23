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
    (routes || []).forEach((r, di) => {
      const pos = r?.positions;
      if (!pos || pos.length === 0) return;
      if (idx > 0) boundaries.push(idx);
      labels.push({ atIdx: idx, time: formatHM(r.startDate || pos[0]?.date) });
      for (const p of pos) {
        flat.push({ speed: p.speed, elev: p.elev, temp: p.temp, driveIdx: di });
        idx++;
      }
    });
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
  let elevGain = null;
  if (elevVals.length >= 2) {
    elevGain = Math.round(elevVals[elevVals.length - 1] - elevVals[0]);
  }

  const tempVals = flat.map(f => f.temp).filter(v => v != null);
  const minTemp = tempVals.length ? Math.round(Math.min(...tempVals)) : null;
  const maxTemp = tempVals.length ? Math.round(Math.max(...tempVals)) : null;

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
  const sel = hasSel ? flat[selectedIdx] : null;
  const totalH = ROW_H * 3;

  return (
    <div className="px-3 pt-2 pb-2 border-t border-white/[0.04]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${totalH}`}
        preserveAspectRatio="none"
        className="w-full block touch-none select-none cursor-crosshair"
        style={{ height: `${totalH}px` }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); handlePointer(e); }}
        onPointerMove={(e) => { if (e.buttons) handlePointer(e); }}
      >
        {boundaries.map((bi, k) => {
          const x = xOf(bi);
          return (
            <line key={`b${k}`} x1={x} y1={0} x2={x} y2={totalH}
              stroke="#52525b" strokeWidth={0.8} strokeDasharray="2 2" opacity={0.7} />
          );
        })}

        <g transform="translate(0,0)">
          <path d={speed.d} stroke="#38bdf8" strokeWidth={1.3} fill="none" vectorEffect="non-scaling-stroke" />
        </g>
        <g transform={`translate(0,${ROW_H})`}>
          <path d={elev.d} stroke="#a3e635" strokeWidth={1.3} fill="none" vectorEffect="non-scaling-stroke" />
        </g>
        <g transform={`translate(0,${ROW_H * 2})`}>
          <path d={temp.d} stroke="#fb923c" strokeWidth={1.3} fill="none" vectorEffect="non-scaling-stroke" />
        </g>

        {hasSel && (
          <>
            <line x1={selX} y1={0} x2={selX} y2={totalH}
              stroke="#e879f9" strokeWidth={1} strokeDasharray="2 3" opacity={0.8} />
            {sel.speed != null && speed.yOf && (
              <circle cx={selX} cy={speed.yOf(sel.speed)} r={2.5} fill="#e879f9" />
            )}
            {sel.elev != null && elev.yOf && (
              <circle cx={selX} cy={ROW_H + elev.yOf(sel.elev)} r={2.5} fill="#e879f9" />
            )}
            {sel.temp != null && temp.yOf && (
              <circle cx={selX} cy={ROW_H * 2 + temp.yOf(sel.temp)} r={2.5} fill="#e879f9" />
            )}
          </>
        )}
      </svg>

      <div className="mt-1 grid gap-0.5 text-[10px] tabular-nums leading-tight">
        <div className="flex items-center justify-between">
          <span className="text-sky-400">🚗 속도</span>
          <span className="text-zinc-500">
            {hasSel && sel.speed != null && (
              <span className="text-fuchsia-400 mr-2">{Math.round(sel.speed)}km/h</span>
            )}
            {maxSpeed != null && `최고 ${maxSpeed} · 평균 ${avgSpeed}km/h`}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-lime-400">⛰ 고도</span>
          <span className="text-zinc-500">
            {hasSel && sel.elev != null && (
              <span className="text-fuchsia-400 mr-2">{Math.round(sel.elev)}m</span>
            )}
            {minElev != null && `${minElev}~${maxElev}m${elevGain != null ? ` (${elevGain >= 0 ? '+' : ''}${elevGain})` : ''}`}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-orange-400">🌡 외기온</span>
          <span className="text-zinc-500">
            {hasSel && sel.temp != null && (
              <span className="text-fuchsia-400 mr-2">{(Math.round(sel.temp * 10) / 10).toFixed(1)}°C</span>
            )}
            {minTemp != null && `${minTemp}~${maxTemp}°C`}
          </span>
        </div>
      </div>

      {labels.length > 1 && (
        <div className="mt-1 relative h-3 text-[9px] text-zinc-600 tabular-nums">
          {labels.map((lbl, i) => (
            <span
              key={i}
              className="absolute whitespace-nowrap"
              style={{ left: `${(lbl.atIdx / (n - 1)) * 100}%`, transform: 'translateX(-50%)' }}
            >
              {lbl.time}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
