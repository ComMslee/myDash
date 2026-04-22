// RecordsHabit.js
import { useState } from 'react';
import { formatKorDate } from '@/lib/format';

const PERIODS = [
  { key: 'all', label: '전체' },
  { key: 'six_month', label: '6개월' },
  { key: 'month', label: '1달' },
];

export function DailyRecordsCard({ records }) {
  const [period, setPeriod] = useState('all');
  const r = records[period] || records.all || records;

  const cells = [
    {
      icon: '🔋',
      label: '가장 많이 충전',
      data: r.max_charge,
      mainVal: r.max_charge ? `${r.max_charge.kwh} kWh` : null,
      subVal: r.max_charge ? `+${r.max_charge.charge_pct}%` : null,
      valClass: 'text-emerald-400',
      accentClass: 'bg-emerald-500',
    },
    {
      icon: '⚡',
      label: '가장 많이 소비',
      data: r.max_consume,
      mainVal: r.max_consume ? `${r.max_consume.consume_kwh} kWh` : null,
      subVal: r.max_consume ? `-${r.max_consume.consume_pct}%` : null,
      valClass: 'text-blue-400',
      accentClass: 'bg-blue-500',
    },
    {
      icon: '💤',
      label: '가장 적게 충전',
      data: r.min_charge,
      mainVal: r.min_charge ? `${r.min_charge.kwh} kWh` : null,
      subVal: r.min_charge ? `+${r.min_charge.charge_pct}%` : null,
      valClass: 'text-emerald-400',
      accentClass: 'bg-emerald-500',
    },
    {
      icon: '🛑',
      label: '가장 적게 소비',
      data: r.min_consume,
      mainVal: r.min_consume ? `${r.min_consume.consume_kwh} kWh` : null,
      subVal: r.min_consume ? `-${r.min_consume.consume_pct}%` : null,
      valClass: 'text-blue-400',
      accentClass: 'bg-blue-500',
    },
  ];

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">일간 최고 기록</span>
        <div className="flex items-center gap-1">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                period === p.key
                  ? 'bg-blue-400/[0.15] border-blue-400/30 text-blue-300'
                  : 'border-white/[0.08] text-zinc-600 hover:text-zinc-400'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2">
        {cells.map((c, i) => {
          const hasData = !!c.data;
          const date = hasData ? formatKorDate(c.data.date) : null;
          const isLeft = i % 2 === 0;
          const isTop = i < 2;

          return (
            <div
              key={i}
              className={[
                'relative px-4 py-3.5',
                isLeft ? 'border-r' : '',
                isTop ? 'border-b' : '',
                'border-white/[0.06]',
                !hasData ? 'opacity-50' : '',
              ].join(' ')}
            >
              <div
                className={`absolute top-0 ${isLeft ? 'left-0 right-0' : 'left-0 right-0'} h-[2px] ${c.accentClass} opacity-60`}
              />
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className={`text-base ${!hasData ? 'grayscale' : ''}`}>{c.icon}</span>
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">{c.label}</span>
              </div>
              {hasData ? (
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-[10px] text-zinc-500 tabular-nums">{date}</span>
                  <span className={`text-base font-black leading-none tabular-nums ${c.valClass}`}>{c.mainVal}</span>
                  <span className="text-[10px] text-zinc-500 tabular-nums">{c.subVal}</span>
                </div>
              ) : (
                <div className="text-[10px] text-zinc-700">—</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 누적 분포에서 백분위수 구하기 (bin 단위 → %)
function percentileFromHist(counts, bucketSize, total, pct) {
  const target = total * pct;
  let acc = 0;
  for (let i = 0; i < counts.length; i++) {
    acc += counts[i];
    if (acc >= target) return i * bucketSize + bucketSize / 2;
  }
  return counts.length * bucketSize;
}

function Whisker({ p5, q1, median, q3, p95, color, total }) {
  // VIEW: x축 0~100% 비율
  return (
    <div className="relative h-5">
      {/* 축 배경 */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-white/[0.06]" />
      {total > 0 && (
        <>
          {/* whisker — p5 ~ p95 */}
          <div
            className="absolute top-1/2 -translate-y-1/2 h-px"
            style={{ left: `${p5}%`, width: `${p95 - p5}%`, background: color, opacity: 0.35 }}
          />
          {/* whisker end ticks */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-px h-2"
            style={{ left: `${p5}%`, background: color, opacity: 0.5 }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-px h-2"
            style={{ left: `${p95}%`, background: color, opacity: 0.5 }}
          />
          {/* IQR box q1~q3 */}
          <div
            className="absolute top-1/2 -translate-y-1/2 h-3 rounded-sm"
            style={{ left: `${q1}%`, width: `${Math.max(0.5, q3 - q1)}%`, background: color, opacity: 0.5 }}
          />
          {/* median 점 */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-white/60"
            style={{ left: `calc(${median}% - 4px)`, background: color }}
          />
        </>
      )}
    </div>
  );
}

export function LevelHabitCard({ histogram }) {
  const { start_level, end_level, start_modal_range, end_modal_range } = histogram;
  const bucketSize = 2;

  const startTotal = start_level.reduce((a, b) => a + b, 0);
  const endTotal = end_level.reduce((a, b) => a + b, 0);

  const startStats = startTotal > 0 ? {
    p5: percentileFromHist(start_level, bucketSize, startTotal, 0.05),
    q1: percentileFromHist(start_level, bucketSize, startTotal, 0.25),
    median: percentileFromHist(start_level, bucketSize, startTotal, 0.5),
    q3: percentileFromHist(start_level, bucketSize, startTotal, 0.75),
    p95: percentileFromHist(start_level, bucketSize, startTotal, 0.95),
  } : { p5: 0, q1: 0, median: 0, q3: 0, p95: 0 };
  const endStats = endTotal > 0 ? {
    p5: percentileFromHist(end_level, bucketSize, endTotal, 0.05),
    q1: percentileFromHist(end_level, bucketSize, endTotal, 0.25),
    median: percentileFromHist(end_level, bucketSize, endTotal, 0.5),
    q3: percentileFromHist(end_level, bucketSize, endTotal, 0.75),
    p95: percentileFromHist(end_level, bucketSize, endTotal, 0.95),
  } : { p5: 0, q1: 0, median: 0, q3: 0, p95: 0 };

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-3.5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold text-zinc-300">충전 시작 → 종료 분포</span>
        {startTotal > 0 && <span className="text-[10px] text-zinc-600">{startTotal}회</span>}
      </div>

      {startTotal === 0 ? (
        <p className="text-[10px] text-zinc-600 py-8 text-center">충전 기록이 없습니다</p>
      ) : (
        <>
          <div className="flex flex-col gap-2.5">
            {/* 시작 */}
            <div className="flex items-center gap-2">
              <span className="w-8 text-[10px] text-red-400 font-semibold flex-shrink-0">시작</span>
              <div className="flex-1">
                <Whisker {...startStats} color="#f87171" total={startTotal} />
              </div>
              <span className="w-10 text-[10px] text-zinc-400 tabular-nums text-right flex-shrink-0">
                {Math.round(startStats.median)}%
              </span>
            </div>
            {/* 종료 */}
            <div className="flex items-center gap-2">
              <span className="w-8 text-[10px] text-emerald-400 font-semibold flex-shrink-0">종료</span>
              <div className="flex-1">
                <Whisker {...endStats} color="#34d399" total={endTotal} />
              </div>
              <span className="w-10 text-[10px] text-zinc-400 tabular-nums text-right flex-shrink-0">
                {Math.round(endStats.median)}%
              </span>
            </div>
          </div>
          {/* 공통 0-100 축 */}
          <div className="flex items-center gap-2 mt-1.5">
            <span className="w-8 flex-shrink-0" />
            <div className="flex-1 flex justify-between text-[9px] text-zinc-600 tabular-nums">
              <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
            </div>
            <span className="w-10 flex-shrink-0" />
          </div>
          {/* 요약 */}
          <div className="mt-3 pt-2.5 border-t border-white/[0.04] text-[10px] text-zinc-500 flex items-center justify-center gap-1.5 tabular-nums">
            주로 <span className="text-red-400 font-semibold">{start_modal_range}</span>
            <span className="text-zinc-700">→</span>
            <span className="text-emerald-400 font-semibold">{end_modal_range}</span>
            <span className="text-zinc-700 ml-1">({Math.round(endStats.median - startStats.median)}%p)</span>
          </div>
        </>
      )}
    </div>
  );
}
