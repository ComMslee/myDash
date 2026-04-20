// RecordsHabit.js
import { useState } from 'react';
import { formatKorDate } from '@/lib/format';

function HistBar({ counts, color }) {
  const total = counts.reduce((a, b) => a + b, 0);
  const maxCount = Math.max(1, ...counts);
  const maxH = 56;
  const maxIdx = counts.indexOf(maxCount);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 py-4 text-zinc-600">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9h.01M15 9h.01" />
          <path d="M9 15s1 1 3 1 3-1 3-1" />
        </svg>
        <span className="text-[10px]">충전 기록이 없어요</span>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-0.5" style={{ height: maxH }}>
      {counts.map((cnt, i) => {
        const h = maxCount > 0 ? Math.max(2, Math.round((cnt / maxCount) * maxH)) : 2;
        const isModal = i === maxIdx && cnt > 0;
        return (
          <div key={i} className="flex-1 rounded-t-sm transition-all duration-500"
            style={{
              height: h,
              background: isModal ? color : color,
              opacity: cnt === 0 ? 0.12 : isModal ? 1 : 0.55,
              outline: isModal ? `1.5px solid ${color}` : 'none',
            }}
            title={`${i * 2}–${i * 2 + 2}%: ${cnt}회`}
          />
        );
      })}
    </div>
  );
}

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
      valClass: 'text-emerald-300',
      accentClass: 'bg-emerald-500',
    },
    {
      icon: '🛑',
      label: '가장 적게 소비',
      data: r.min_consume,
      mainVal: r.min_consume ? `${r.min_consume.consume_kwh} kWh` : null,
      subVal: r.min_consume ? `-${r.min_consume.consume_pct}%` : null,
      valClass: 'text-blue-300',
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
                <span className="text-[9px] uppercase tracking-wider text-zinc-600">{c.label}</span>
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

export function LevelHabitCard({ histogram }) {
  const { matrix, start_modal_range, end_modal_range } = histogram;
  if (!matrix) return null;
  const { buckets, bucket_size, cells } = matrix;
  const total = cells.reduce((s, c) => s + c.cnt, 0);
  const maxCnt = Math.max(1, ...cells.map(c => c.cnt));

  // SVG 기하
  const PAD_L = 26, PAD_B = 20, PAD_R = 6, PAD_T = 8;
  const GRID = 260;
  const VIEW_W = PAD_L + GRID + PAD_R;
  const VIEW_H = PAD_T + GRID + PAD_B;
  const CELL = GRID / buckets;

  const cellMap = new Map();
  cells.forEach(c => cellMap.set(`${c.start}-${c.end}`, c.cnt));

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-3.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-zinc-300">충전 시작 → 종료 분포</span>
        {total > 0 && <span className="text-[10px] text-zinc-600">총 {total}회</span>}
      </div>
      {total === 0 ? (
        <p className="text-[10px] text-zinc-600 py-8 text-center">충전 기록이 없습니다</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full h-auto">
            {Array.from({ length: buckets }).map((_, sx) =>
              Array.from({ length: buckets }).map((_, ey) => {
                const cnt = cellMap.get(`${sx}-${ey}`) || 0;
                const x = PAD_L + sx * CELL;
                const y = PAD_T + (buckets - 1 - ey) * CELL;
                const isValid = ey > sx;
                if (cnt === 0) {
                  return (
                    <rect
                      key={`${sx}-${ey}`}
                      x={x} y={y} width={CELL - 0.5} height={CELL - 0.5}
                      fill={isValid ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.008)'}
                      rx="0.5"
                    />
                  );
                }
                const intensity = Math.max(0.25, cnt / maxCnt);
                return (
                  <rect
                    key={`${sx}-${ey}`}
                    x={x} y={y} width={CELL - 0.5} height={CELL - 0.5}
                    fill={`rgba(52,211,153,${intensity})`}
                    rx="1"
                  >
                    <title>{`${sx * bucket_size}~${sx * bucket_size + bucket_size}% → ${ey * bucket_size}~${ey * bucket_size + bucket_size}%: ${cnt}회`}</title>
                  </rect>
                );
              })
            )}
            {/* 대각선 (start=end) */}
            <line
              x1={PAD_L} y1={PAD_T + GRID}
              x2={PAD_L + GRID} y2={PAD_T}
              stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="2 2"
            />
            {/* Y축 라벨 */}
            {[0, 25, 50, 75, 100].map(v => {
              const y = PAD_T + GRID - (v / 100) * GRID;
              return (
                <text key={`y-${v}`} x={PAD_L - 3} y={y + 3} textAnchor="end" fontSize="7" fill="#71717a">
                  {v}
                </text>
              );
            })}
            {/* X축 라벨 */}
            {[0, 25, 50, 75, 100].map(v => {
              const x = PAD_L + (v / 100) * GRID;
              return (
                <text key={`x-${v}`} x={x} y={PAD_T + GRID + 10} textAnchor="middle" fontSize="7" fill="#71717a">
                  {v}
                </text>
              );
            })}
            {/* 축 제목 */}
            <text x={PAD_L + GRID / 2} y={VIEW_H - 2} textAnchor="middle" fontSize="7" fill="#a1a1aa">
              시작 %
            </text>
            <text x={4} y={PAD_T + GRID / 2} textAnchor="middle" fontSize="7" fill="#a1a1aa"
                  transform={`rotate(-90, 4, ${PAD_T + GRID / 2})`}>
              종료 %
            </text>
          </svg>
          <div className="mt-2 text-[10px] text-zinc-600 flex items-center justify-center gap-2">
            <span>주로 <span className="text-red-400 font-semibold">{start_modal_range}</span></span>
            <span className="text-zinc-700">→</span>
            <span><span className="text-emerald-400 font-semibold">{end_modal_range}</span></span>
          </div>
        </>
      )}
    </div>
  );
}
