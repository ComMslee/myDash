'use client';

import { useMemo } from 'react';
import { Icon } from '../lib/Icons';

// 차속·고도·온도 통계 카드 (이전 스파크라인 → 최소/평균/최대 표시로 단순화).
// 호환을 위해 selectedIdx/onSelect 인자는 받되 무시. 그래프·포인터 스크럽 제거.
const METRICS = [
  { key: 'speed', unit: 'km/h', iconName: 'car',         iconClass: 'text-sky-400',    fmt: v => Math.round(v) },
  { key: 'elev',  unit: 'm',    iconName: 'mountain',    iconClass: 'text-lime-400',   fmt: v => Math.round(v) },
  { key: 'temp',  unit: '°C',   iconName: 'thermometer', iconClass: 'text-orange-400', fmt: v => (Math.round(v * 10) / 10).toFixed(1) },
];

function computeStats(vals) {
  if (!vals.length) return { min: null, max: null, avg: null };
  // 단일 패스 — Math.max(...arr) 는 긴 배열에서 스택오버플로 (V8 인자 상한 ~65k)
  let min = vals[0], max = vals[0], sum = 0;
  for (const v of vals) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, max, avg: sum / vals.length };
}

export default function RouteSparklines({ routes }) {
  const { stats, elevGain } = useMemo(() => {
    const flat = [];
    (routes || []).forEach(r => {
      if (!r?.positions) return;
      for (const p of r.positions) flat.push(p);
    });
    const stats = METRICS.map(m => {
      const vals = flat.reduce((a, f) => { if (f[m.key] != null) a.push(f[m.key]); return a; }, []);
      return { ...m, ...computeStats(vals), count: vals.length };
    });
    const elevs = flat.map(p => p.elev).filter(v => v != null);
    const elevGain = elevs.length >= 2 ? Math.round(elevs[elevs.length - 1] - elevs[0]) : null;
    return { stats, elevGain };
  }, [routes]);

  if (!stats.some(s => s.count > 0)) return null;

  return (
    <div className="px-3 py-2 border-t border-white/[0.04] flex flex-col gap-1 text-[11px] tabular-nums">
      {stats.map(s => {
        if (s.min == null) {
          return (
            <div key={s.key} className="flex items-center gap-2 text-zinc-600">
              <span className={`shrink-0 ${s.iconClass}`}><Icon name={s.iconName} className="w-4 h-4" /></span>
              <span>-</span>
            </div>
          );
        }
        const showGain = s.key === 'elev' && elevGain != null;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <span className={`shrink-0 ${s.iconClass}`}><Icon name={s.iconName} className="w-4 h-4" /></span>
            <span className="text-zinc-500">최저</span>
            <span className="text-zinc-300">{s.fmt(s.min)}</span>
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-500">평균</span>
            <span className="text-white font-bold">{s.fmt(s.avg)}</span>
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-500">최고</span>
            <span className="text-zinc-300">{s.fmt(s.max)}</span>
            <span className="text-zinc-500">{s.unit}</span>
            {showGain && (
              <span className="ml-auto text-zinc-500">
                고도차 <span className={elevGain >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {elevGain >= 0 ? '+' : ''}{elevGain}m
                </span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
