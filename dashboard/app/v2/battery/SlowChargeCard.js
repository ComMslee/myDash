'use client';

import { Fragment, useEffect, useMemo, useState, useCallback } from 'react';
import { formatDuration, shortAddr } from '@/lib/format';
import { kstDateStr, kstMondayStr, kstDayOfWeek } from '@/lib/kst';

export default function SlowChargeCard() {
  const [months, setMonths] = useState([]);
  const [records, setRecords] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    fetch('/api/slow-charges')
      .then(r => r.json())
      .then(d => {
        setMonths(d.months || []);
        setRecords(d.records || []);
        setHasMore(d.has_more || false);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const loadMore = useCallback(() => {
    if (loadingMore) return;
    setLoadingMore(true);
    fetch(`/api/slow-charges?offset=${records.length}`)
      .then(r => r.json())
      .then(d => {
        setRecords(prev => [...prev, ...(d.records || [])]);
        setHasMore(d.has_more || false);
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false));
  }, [records.length, loadingMore]);

  const totalKwh = useMemo(() => months.reduce((s, m) => s + m.total_kwh, 0), [months]);
  const avgKw = useMemo(() => {
    const valid = months.filter(m => m.avg_kw != null);
    return valid.length ? valid.reduce((s, m) => s + m.avg_kw, 0) / valid.length : null;
  }, [months]);

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
    const fm = mon.getUTCMonth() + 1, fd = mon.getUTCDate();
    const lm = sun.getUTCMonth() + 1, ld = sun.getUTCDate();
    return fm === lm ? `${fm}/${fd} ~ ${ld}` : `${fm}/${fd} ~ ${lm}/${ld}`;
  };

  if (loading) {
    return (
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl flex items-center justify-center py-10">
        <div className="w-5 h-5 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }
  if (!months.length) {
    return (
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-6 text-center">
        <p className="text-zinc-600 text-sm">완속 충전 기록이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 py-2 border-b border-white/[0.06] flex items-center justify-between gap-2 tabular-nums">
        <span className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-xs font-bold text-zinc-200 shrink-0">완속 충전 기록</span>
          <span className="text-[11px] text-zinc-600 shrink-0">{months.reduce((s, m) => s + m.count, 0)}건</span>
        </span>
        <span className="flex items-baseline gap-2 text-[11px] shrink-0">
          <span className="text-emerald-400 font-bold">
            {parseFloat(totalKwh.toFixed(1))}<span className="text-zinc-600 ml-0.5">kWh</span>
          </span>
          {avgKw != null && (
            <span className="text-emerald-400">
              {parseFloat(avgKw.toFixed(1))}<span className="text-zinc-600 ml-0.5">kW</span><span className="text-zinc-700 ml-0.5">평균</span>
            </span>
          )}
        </span>
      </div>

      {/* 월별 집계 — 항상 표시 */}
      <div className="border-b border-white/[0.06]">
        {months.map(m => (
          <div key={m.month} className="px-4 py-1.5 flex items-center justify-between text-[11px] tabular-nums border-t border-white/[0.04] first:border-t-0">
            <span className="text-zinc-400">{m.month.replace('-', '년 ')}월</span>
            <span className="flex items-center gap-2">
              <span className="text-zinc-600">{m.count}건</span>
              <span className="text-emerald-400 font-bold">{m.total_kwh}<span className="text-zinc-600 ml-0.5">kWh</span></span>
              {m.avg_kw != null && <span className="text-zinc-500">{m.avg_kw}<span className="text-zinc-600 ml-0.5">kW평균</span></span>}
            </span>
          </div>
        ))}
      </div>

      {/* 주별 상세 — 초기 20건 바로 표시 */}
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
                const endTime = r.duration_min ? fmtTime(new Date(dt.getTime() + r.duration_min * 60000)) : null;
                const socDelta = (r.soc_start != null && r.soc_end != null) ? r.soc_end - r.soc_start : null;
                const tipParts = [
                  shortAddr(r.location),
                  endTime ? `${startTime}~${endTime}` : startTime,
                  r.duration_min ? formatDuration(r.duration_min) : null,
                  (r.soc_start != null && r.soc_end != null) ? `${r.soc_start}→${r.soc_end}%` : null,
                  `${r.energy_kwh}kWh`,
                  r.avg_power ? `평균 ${r.avg_power}kW` : null,
                ].filter(Boolean);
                return (
                  <div key={r.id} className="px-4 py-2 border-t border-white/[0.04] flex items-center gap-1.5 text-[11px] tabular-nums" title={tipParts.join(' · ')}>
                    <span className="font-bold text-zinc-300 shrink-0">{dateLabel}</span>
                    <span className="text-zinc-500 truncate min-w-0 flex-1">{shortAddr(r.location)}</span>
                    <span className="text-zinc-400 shrink-0">{startTime}{endTime && `~${endTime}`}</span>
                    {r.duration_min && <span className="text-zinc-600 shrink-0">{formatDuration(r.duration_min)}</span>}
                    {socDelta != null && <span className="text-sky-400 shrink-0">{socDelta >= 0 ? '+' : ''}{socDelta}%</span>}
                    <span className="text-emerald-400 font-bold shrink-0">{r.energy_kwh}<span className="text-zinc-600 ml-0.5">kWh</span></span>
                    {r.avg_power && <span className="text-emerald-400 shrink-0">{r.avg_power}<span className="text-zinc-600 ml-0.5">kW</span></span>}
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>

      {/* 더 보기 */}
      {hasMore && (
        <div className="border-t border-white/[0.06] px-4 py-2">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors py-1 disabled:opacity-50"
          >
            {loadingMore
              ? <span className="w-3 h-3 border border-zinc-500 border-t-transparent rounded-full animate-spin" />
              : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            }
            {loadingMore ? '로딩 중...' : '더 보기'}
          </button>
        </div>
      )}
    </div>
  );
}
