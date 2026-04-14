'use client';
import { useState } from 'react';

export default function WeeklyCard({ weeks }) {
  const [showAll, setShowAll] = useState(false);
  const completedWeeks = weeks.filter(w => !w.is_current);

  const avgChargeKwh = completedWeeks.length
    ? (completedWeeks.reduce((s, w) => s + w.charge_kwh, 0) / completedWeeks.length).toFixed(1)
    : '0.0';
  const avgConsumeKwh = completedWeeks.length
    ? (completedWeeks.reduce((s, w) => s + w.consume_kwh, 0) / completedWeeks.length).toFixed(1)
    : '0.0';

  const displayedWeeks = showAll ? weeks : weeks.slice(0, 4);
  const maxBar = Math.max(1, ...weeks.map(w => Math.max(w.charge_kwh, w.consume_kwh)));

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <span className="text-xs font-bold text-zinc-200">충전 · 소비</span>
        <button
          onClick={() => setShowAll(v => !v)}
          className="text-[10px] text-blue-400 px-2 py-1 rounded-full bg-blue-400/[0.08] border border-blue-400/20 transition-opacity active:opacity-60"
        >
          {showAll ? '최근 4주' : '전체 12주'}
        </button>
      </div>
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-1.5 rounded-sm bg-emerald-400" />
            <span className="text-[10px] text-zinc-500">충전</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-1.5 rounded-sm bg-blue-400" />
            <span className="text-[10px] text-zinc-500">소비</span>
          </div>
        </div>
        {completedWeeks.length > 0 && (
          <span className="text-[10px] text-zinc-500 whitespace-nowrap">
            평균 충전 {avgChargeKwh} · 소비 {avgConsumeKwh} kWh
          </span>
        )}
      </div>
      {displayedWeeks.map((week) => {
        const chargeWidth = maxBar > 0 ? (week.charge_kwh / maxBar) * 100 : 0;
        const consumeWidth = maxBar > 0 ? (week.consume_kwh / maxBar) * 100 : 0;
        const net = (week.charge_kwh - week.consume_kwh).toFixed(1);
        const netPositive = parseFloat(net) >= 0;
        const isEmpty = week.charge_kwh === 0 && week.consume_kwh === 0;

        return (
          <div
            key={week.iso_year + '-' + week.iso_week}
            className={'grid items-center gap-2 px-4 py-2.5 border-t border-white/[0.04]' + (isEmpty ? ' opacity-40' : '')}
            style={{ gridTemplateColumns: '52px 1fr auto' }}
          >
            {/* 주 라벨 */}
            <div className="min-w-0">
              <div className="text-[11px] text-zinc-400 font-medium whitespace-nowrap">
                {week.is_current ? '이번주' : week.iso_week + '주차'}
              </div>
              {week.is_current ? (
                <div className="text-[9px] mt-0.5 text-blue-400">진행 중</div>
              ) : (
                <div className="text-[9px] mt-0.5 text-zinc-600 whitespace-nowrap">{week.date_range}</div>
              )}
            </div>

            {/* 바 */}
            <div className="flex flex-col gap-1 min-w-0">
              <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-emerald-400" style={{ width: chargeWidth + '%' }} />
              </div>
              <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-blue-400" style={{ width: consumeWidth + '%' }} />
              </div>
            </div>

            {/* 값 */}
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] tabular-nums text-emerald-400 whitespace-nowrap">+{week.charge_kwh.toFixed(1)}</span>
              <span className="text-[10px] tabular-nums text-blue-400 whitespace-nowrap">−{week.consume_kwh.toFixed(1)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
