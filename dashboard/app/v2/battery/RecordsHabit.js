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

// 시작→종료 흐름 차트 (C안) — 한 트랙에 시작/종료 IQR 음영 + median 잇는 화살표
function FlowChart({ start, end }) {
  const sm = start.median, em = end.median;
  const fwd = em >= sm;
  const lineLeft = Math.min(sm, em);
  const lineWidth = Math.abs(em - sm);
  const arrowLeft = fwd ? em : sm;

  return (
    <div className="relative h-7">
      {/* 가이드 0/25/50/75/100 */}
      {[0, 25, 50, 75, 100].map(t => (
        <div
          key={t}
          className="absolute top-1 bottom-1 w-px bg-white/[0.05] pointer-events-none"
          style={{ left: `${t}%` }}
        />
      ))}
      {/* 축 베이스라인 */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-white/[0.06]" />
      {/* 시작 IQR (빨강 음영) */}
      <div
        className="absolute top-1/2 -translate-y-1/2 h-4 rounded"
        style={{ left: `${start.q1}%`, width: `${Math.max(0.5, start.q3 - start.q1)}%`, background: '#fbbf24', opacity: 0.2 }}
        title={`시작 25~75%: ${Math.round(start.q1)}~${Math.round(start.q3)}%`}
      />
      {/* 종료 IQR (초록 음영) */}
      <div
        className="absolute top-1/2 -translate-y-1/2 h-4 rounded"
        style={{ left: `${end.q1}%`, width: `${Math.max(0.5, end.q3 - end.q1)}%`, background: '#34d399', opacity: 0.2 }}
        title={`종료 25~75%: ${Math.round(end.q1)}~${Math.round(end.q3)}%`}
      />
      {/* median 잇는 그라디언트 라인 */}
      {lineWidth > 0 && (
        <div
          className="absolute top-1/2 -translate-y-1/2 h-0.5 rounded pointer-events-none"
          style={{
            left: `${lineLeft}%`,
            width: `${lineWidth}%`,
            background: fwd
              ? 'linear-gradient(to right, #fbbf24, #34d399)'
              : 'linear-gradient(to left, #fbbf24, #34d399)',
            opacity: 0.85,
          }}
        />
      )}
      {/* 시작 median 점 */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-amber-400 border border-white/50 z-10"
        style={{ left: `calc(${sm}% - 5px)` }}
        title={`시작 중앙값 ${Math.round(sm)}%`}
      />
      {/* 종료 median 화살표 머리 */}
      <svg
        className="absolute z-10 pointer-events-none"
        style={{
          left: `calc(${arrowLeft}% - ${fwd ? 0 : 7}px)`,
          top: 'calc(50% - 5px)',
          width: 7,
          height: 10,
          transform: fwd ? 'none' : 'rotate(180deg)',
          transformOrigin: 'center',
        }}
        viewBox="0 0 7 10"
      >
        <path d="M0 0 L7 5 L0 10 Z" fill="#34d399" stroke="rgba(255,255,255,0.6)" strokeWidth="0.5" />
      </svg>
    </div>
  );
}

export function LevelHabitCard({ histogram }) {
  const { start_level, end_level, start_modal_range, end_modal_range } = histogram;
  const bucketSize = 2;

  const startTotal = start_level.reduce((a, b) => a + b, 0);
  const endTotal = end_level.reduce((a, b) => a + b, 0);

  const startStats = startTotal > 0 ? {
    q1: percentileFromHist(start_level, bucketSize, startTotal, 0.25),
    median: percentileFromHist(start_level, bucketSize, startTotal, 0.5),
    q3: percentileFromHist(start_level, bucketSize, startTotal, 0.75),
  } : { q1: 0, median: 0, q3: 0 };
  const endStats = endTotal > 0 ? {
    q1: percentileFromHist(end_level, bucketSize, endTotal, 0.25),
    median: percentileFromHist(end_level, bucketSize, endTotal, 0.5),
    q3: percentileFromHist(end_level, bucketSize, endTotal, 0.75),
  } : { q1: 0, median: 0, q3: 0 };

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-3.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold text-zinc-300">충전 시작 → 종료 분포</span>
        {startTotal > 0 && <span className="text-[10px] text-zinc-600">{startTotal}회</span>}
      </div>
      <p className="text-[10px] text-zinc-500 mb-3">보통 어느 SOC 에서 시작해 어디까지 채우는지</p>

      {startTotal === 0 ? (
        <p className="text-[10px] text-zinc-600 py-8 text-center">충전 기록이 없습니다</p>
      ) : (
        <>
          {/* 흐름 차트 */}
          <FlowChart start={startStats} end={endStats} />
          {/* 0~100 축 라벨 */}
          <div className="flex justify-between text-[9px] text-zinc-600 tabular-nums mt-0.5">
            <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
          </div>
          {/* 범례 */}
          <div className="flex items-center justify-center gap-3 mt-2 text-[9px] text-zinc-600">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400" /> 시작
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> 종료
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-2 rounded-sm bg-white/10" /> 50% 분포
            </span>
          </div>
          {/* 요약 */}
          <div className="mt-2.5 pt-2 border-t border-white/[0.04] text-[10px] text-zinc-500 flex items-center justify-center gap-1.5 tabular-nums">
            주로 <span className="text-amber-400 font-semibold">{start_modal_range}</span>
            <span className="text-zinc-700">→</span>
            <span className="text-emerald-400 font-semibold">{end_modal_range}</span>
            <span className="text-zinc-700 ml-1">({Math.round(endStats.median - startStats.median)}%p)</span>
          </div>
        </>
      )}
    </div>
  );
}
