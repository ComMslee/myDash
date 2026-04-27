'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { formatDuration, shortAddr } from '@/lib/format';
import { kstDateStr, kstMondayStr, kstDayOfWeek } from '@/lib/kst';

export default function SlowChargeCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/slow-charges')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  const records = data?.records || [];

  // 주(월~일) 단위 집계 — IdleDrainCard와 동일 규칙
  const weeks = useMemo(() => {
    const weekMap = new Map();
    const weekOrder = [];
    for (const r of records) {
      const weekKey = kstMondayStr(r.start_date);
      let w = weekMap.get(weekKey);
      if (!w) {
        w = { weekKey, items: [], totalKwh: 0 };
        weekMap.set(weekKey, w);
        weekOrder.push(weekKey);
      }
      w.items.push(r);
      w.totalKwh += Number(r.energy_kwh) || 0;
    }
    return weekOrder.map(wk => weekMap.get(wk));
  }, [records]);

  // 기본 모두 접힘 — 사용자가 원하는 주만 펼침
  const [expandedWeeks, setExpandedWeeks] = useState(() => new Set());
  const toggleWeek = (wk) => setExpandedWeeks(prev => {
    const next = new Set(prev);
    if (next.has(wk)) next.delete(wk); else next.add(wk);
    return next;
  });

  const todayWeekKey = useMemo(() => kstMondayStr(kstDateStr(Date.now()) + 'T00:00:00Z'), []);
  const weekLabel = (weekKey) => {
    const diff = Math.round(
      (new Date(todayWeekKey + 'T00:00:00Z').getTime() - new Date(weekKey + 'T00:00:00Z').getTime()) / (7 * 86400000)
    );
    if (diff === 0) return '이번 주';
    if (diff === 1) return '지난 주';
    return `${diff}주 전`;
  };
  const weekRange = (weekKey) => {
    const mon = new Date(weekKey + 'T00:00:00Z');
    const sun = new Date(mon.getTime() + 6 * 86400000);
    return `${mon.getUTCMonth() + 1}/${mon.getUTCDate()} ~ ${sun.getUTCMonth() + 1}/${sun.getUTCDate()}`;
  };

  if (loading) {
    return (
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl flex items-center justify-center py-10">
        <div className="w-5 h-5 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-6 text-center">
        <p className="text-zinc-500 text-sm">데이터를 불러올 수 없습니다</p>
      </div>
    );
  }
  if (!records.length) {
    return (
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-6 text-center">
        <p className="text-zinc-600 text-sm">완속 충전 기록이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <span className="text-xs font-bold text-zinc-200">완속 충전 기록</span>
        <span className="text-xs text-zinc-600">{records.length}건</span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: '360px' }}>
        {weeks.map(week => {
          const expanded = expandedWeeks.has(week.weekKey);
          return (
            <Fragment key={week.weekKey}>
              <button
                onClick={() => toggleWeek(week.weekKey)}
                className="w-full px-4 py-2 border-t border-white/[0.08] first:border-t-0 bg-white/[0.03] hover:bg-white/[0.06] flex items-center justify-between gap-2 text-left transition-colors"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <svg className={`w-3 h-3 text-zinc-500 flex-shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  <span className="text-[10px] font-bold text-zinc-300">{weekLabel(week.weekKey)}</span>
                  <span className="text-[10px] text-zinc-600 tabular-nums">{weekRange(week.weekKey)}</span>
                </span>
                <span className="flex items-center gap-2 tabular-nums flex-shrink-0">
                  <span className="text-[10px] text-zinc-600">{week.items.length}건</span>
                  <span className="text-[10px] font-bold text-emerald-400">
                    {Math.round(week.totalKwh * 10) / 10}<span className="text-zinc-600 ml-0.5">kWh</span>
                  </span>
                </span>
              </button>
              {expanded && week.items.map(r => {
                const dt = new Date(r.start_date);
                const dateLabel = `${dt.getMonth()+1}/${dt.getDate()}`;
                const fmtTime = (d) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                const startTime = fmtTime(dt);
                const endTime = r.duration_min
                  ? fmtTime(new Date(dt.getTime() + r.duration_min * 60000))
                  : null;
                const socDelta = (r.soc_start != null && r.soc_end != null)
                  ? r.soc_end - r.soc_start : null;

                return (
                  <div key={r.id} className="px-4 py-3 border-t border-white/[0.04] space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-zinc-300 font-bold tabular-nums flex-shrink-0">{dateLabel}</span>
                      <span className="text-xs text-zinc-400 truncate text-right">{shortAddr(r.location)}</span>
                    </div>
                    <div className="text-xs text-zinc-400 tabular-nums">
                      <span>{startTime}</span>
                      {endTime && <><span className="text-zinc-600 mx-1">-</span><span>{endTime}</span></>}
                      {r.duration_min && <span className="text-zinc-600 ml-1.5">({formatDuration(r.duration_min)})</span>}
                    </div>
                    {r.soc_start != null && r.soc_end != null && (
                      <div className="text-xs text-zinc-400 tabular-nums">
                        <span>{r.soc_start}%</span>
                        <span className="text-zinc-600 mx-1">-</span>
                        <span>{r.soc_end}%</span>
                        {socDelta != null && <span className="text-zinc-600 ml-1.5">({socDelta >= 0 ? '+' : ''}{socDelta}%)</span>}
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-xs tabular-nums flex-wrap pt-0.5">
                      <span className="text-emerald-400 font-bold">{r.energy_kwh}<span className="text-zinc-600 ml-0.5">kWh</span></span>
                      {r.avg_power && (
                        <span className="text-emerald-400 font-bold">{r.avg_power}<span className="text-zinc-600 ml-0.5">kW</span><span className="text-zinc-700 ml-0.5">평균</span></span>
                      )}
                      {r.max_power && (
                        <span className="text-zinc-500">{r.max_power}<span className="text-zinc-700 ml-0.5">최대</span></span>
                      )}
                      {r.min_power && (
                        <span className="text-zinc-500">{r.min_power}<span className="text-zinc-700 ml-0.5">최소</span></span>
                      )}
                    </div>
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
