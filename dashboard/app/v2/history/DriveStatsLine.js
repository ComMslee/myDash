'use client';

import { Icon } from '@/app/lib/Icons';

// positions(array) → speed/elev/temp 각각의 min/max/avg (+ elev gain) 1패스 집계
export function routePosStats(positions) {
  if (!positions || positions.length === 0) return null;
  const keys = ['speed', 'elev', 'temp'];
  const out = {};
  for (const k of keys) {
    let min = null, max = null, sum = 0, cnt = 0;
    for (const p of positions) {
      const v = p[k];
      if (v == null) continue;
      if (min == null || v < min) min = v;
      if (max == null || v > max) max = v;
      sum += v;
      cnt++;
    }
    out[k] = cnt > 0 ? { min, max, avg: sum / cnt } : null;
  }
  if (out.elev) {
    const elevs = positions.map(p => p.elev).filter(v => v != null);
    out.elev.gain = elevs.length >= 2 ? elevs[elevs.length - 1] - elevs[0] : null;
  }
  return out;
}

// 일자 모드 행의 1줄 통계 — 평균만 (속도만 평균+최고). 자세한 min/avg/max 는 상단 RouteSparklines 패널.
export default function DriveStatsLine({ stats }) {
  if (!stats) return null;
  const sp = stats.speed, el = stats.elev, tp = stats.temp;
  if (!sp && !el && !tp) return null;
  const fmt0 = v => Math.round(v);
  const fmt1 = v => (Math.round(v * 10) / 10).toFixed(1);
  return (
    <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[10px] tabular-nums text-zinc-500 pl-7 mt-1">
      {sp && (
        <span className="inline-flex items-center gap-1">
          <Icon name="car" className="w-3 h-3 text-sky-400 shrink-0" />
          <span className="text-zinc-300 font-semibold">{fmt0(sp.avg)}</span>
          <span className="text-zinc-700">/</span>
          <span>{fmt0(sp.max)}</span>
          <span className="text-zinc-600">km/h</span>
        </span>
      )}
      {el && (
        <span className="inline-flex items-center gap-1">
          <Icon name="mountain" className="w-3 h-3 text-lime-400 shrink-0" />
          <span className="text-zinc-300 font-semibold">{fmt0(el.avg)}</span>
          <span className="text-zinc-600">m</span>
          {el.gain != null && (
            <span className={el.gain >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              ({el.gain >= 0 ? '+' : ''}{Math.round(el.gain)})
            </span>
          )}
        </span>
      )}
      {tp && (
        <span className="inline-flex items-center gap-1">
          <Icon name="thermometer" className="w-3 h-3 text-orange-400 shrink-0" />
          <span className="text-zinc-300 font-semibold">{fmt1(tp.avg)}</span>
          <span className="text-zinc-600">°C</span>
        </span>
      )}
    </div>
  );
}
