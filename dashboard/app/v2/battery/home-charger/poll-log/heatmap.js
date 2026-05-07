'use client';

// 지표별 색상 팔레트 — 5지표 히트맵 + 실패(재시도)
export const METRIC_COLORS = {
  attempts:  '#3b82f6',
  successes: '#10b981',
  partial:   '#f59e0b',
  retries:   '#f43f5e',
  quotaHits: '#fb923c',
};

// 공통 히트맵 행: [라벨][24셀][합][보조]
export function HeatmapRow({ label, values, max, color, cellHeight = 'h-4', primary, secondary, cellTitle }) {
  let peakIdx = -1;
  let peakVal = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] > peakVal) { peakVal = values[i]; peakIdx = i; }
  }
  return (
    <div className="flex items-center gap-1.5 text-[10px] tabular-nums">
      <span className="w-12 shrink-0 text-[11px] text-zinc-400 whitespace-nowrap">{label}</span>
      <div className={`flex-1 flex gap-0.5 ${cellHeight}`}>
        {values.map((v, i) => {
          const ratio = max > 0 ? v / max : 0;
          const isPeak = i === peakIdx && v > 0;
          return (
            <div
              key={i}
              className="flex-1 rounded-[3px]"
              style={{
                background: isPeak ? '#f59e0b' : color,
                opacity: v === 0 ? 0.08 : 0.18 + ratio * 0.82,
              }}
              title={cellTitle ? cellTitle(i, v) : `${String(i).padStart(2, '0')}시 · ${label} ${v}`}
            />
          );
        })}
      </div>
      <span className="w-8 shrink-0 text-right text-zinc-300 font-semibold">{primary}</span>
      <span className="w-10 shrink-0 text-right text-zinc-500">{secondary}</span>
    </div>
  );
}

export function HeatmapXAxis({ primaryLabel = '합', secondaryLabel = '피크' }) {
  return (
    <div className="flex items-center gap-1.5 text-[9px] text-zinc-600 tabular-nums">
      <span className="w-12 shrink-0" />
      <div className="flex-1 flex justify-between px-px">
        <span className="font-semibold">0시</span><span>6</span><span>12</span><span>18</span><span>23시</span>
      </div>
      <span className="w-8 shrink-0 text-right">{primaryLabel}</span>
      <span className="w-10 shrink-0 text-right">{secondaryLabel}</span>
    </div>
  );
}

function successRate(row) {
  if (!row || !row.attempts) return null;
  const ok = (row.successes || 0) + (row.partial || 0) + (row.retrySuccesses || 0);
  return Math.round((ok / row.attempts) * 100);
}

// 시간별 탭: 4지표 × 24시간 히트맵
export function MetricHeatmap5Row({ hourly }) {
  const metrics = [
    { key: 'attempts',  label: '시도' },
    { key: 'successes', label: '성공' },
    { key: 'partial',   label: '부분' },
    { key: 'retries',   label: '재실패' },
  ];
  return (
    <div className="space-y-1">
      <HeatmapXAxis />
      {metrics.map(m => {
        const values = hourly.map(r => r[m.key] || 0);
        const sum = values.reduce((a, b) => a + b, 0);
        const rowMax = Math.max(1, ...values);
        const peakIdx = sum > 0 ? values.indexOf(Math.max(...values)) : -1;
        return (
          <HeatmapRow
            key={m.key}
            label={m.label}
            values={values}
            max={rowMax}
            color={METRIC_COLORS[m.key]}
            primary={sum > 0 ? sum : '·'}
            secondary={peakIdx >= 0 ? `${peakIdx}시` : '-'}
            cellTitle={(h, v) => `${String(h).padStart(2, '0')}시 · ${m.label} ${v}`}
          />
        );
      })}
    </div>
  );
}

// 일별 탭: N일 × 24시간 실패(재시도실패+쿼터) 히트맵
export function DailyFailureHeatmap({ dailyByHour, daily, todayStr }) {
  const dailyMap = new Map((daily || []).map(d => [d.date, d]));
  let globalMax = 0;
  for (const d of dailyByHour) {
    for (const h of d.hours) {
      const fail = (h.retries || 0) + (h.quotaHits || 0);
      if (fail > globalMax) globalMax = fail;
    }
  }
  globalMax = Math.max(1, globalMax);
  const cellHeight = dailyByHour.length > 20 ? 'h-3' : 'h-4';
  return (
    <div className="space-y-1">
      <HeatmapXAxis secondaryLabel="성공률" />
      {dailyByHour.length === 0 && (
        <div className="text-center text-zinc-600 py-4 text-[11px]">기록된 일별 데이터 없음</div>
      )}
      {dailyByHour.map(d => {
        const values = d.hours.map(h => (h.retries || 0) + (h.quotaHits || 0));
        const sum = values.reduce((a, b) => a + b, 0);
        const rowForDate = dailyMap.get(d.date);
        const rate = successRate(rowForDate);
        const rateLabel = rate == null ? '-' : `${rate}%`;
        const dateLabel = d.date.slice(5).replace('-', '/');
        const isToday = d.date === todayStr;
        return (
          <HeatmapRow
            key={d.date}
            label={<span className={isToday ? 'text-amber-400 font-semibold' : undefined}>{dateLabel}</span>}
            values={values}
            max={globalMax}
            color={METRIC_COLORS.retries}
            cellHeight={cellHeight}
            primary={sum > 0 ? sum : '·'}
            secondary={rateLabel}
            cellTitle={(h, v) => {
              const row = d.hours[h];
              return `${dateLabel} ${String(h).padStart(2, '0')}시 · 실패 ${v}` +
                (row.attempts ? ` / 시도 ${row.attempts}` : '');
            }}
          />
        );
      })}
    </div>
  );
}
