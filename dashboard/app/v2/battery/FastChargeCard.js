'use client';

import { useState, useEffect } from 'react';
import { formatDuration, shortAddr } from '@/lib/format';

export default function FastChargeCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/fast-charges')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

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
  if (!data?.records?.length) {
    return (
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-6 text-center">
        <p className="text-zinc-600 text-sm">급속 충전 기록이 없습니다</p>
      </div>
    );
  }

  const records = data.records;

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <span className="text-xs font-bold text-zinc-200">급속 충전 기록</span>
        <span className="text-xs text-zinc-600">{records.length}건</span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: '360px' }}>
        {records.map(r => {
          const dt = new Date(r.start_date);
          const dateLabel = `${dt.getMonth()+1}/${dt.getDate()}`;
          const timeLabel = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
          const brandLabel = r.charger_brand === 'Tesla' ? 'SC' : r.charger_type || '급속';

          return (
            <div key={r.id} className="px-4 py-3 border-b border-white/[0.06] last:border-0">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-300 font-bold tabular-nums">{dateLabel}</span>
                  <span className="text-xs text-zinc-500 tabular-nums">{timeLabel}</span>
                  {r.duration_min && <span className="text-xs text-zinc-600 tabular-nums">{formatDuration(r.duration_min)}</span>}
                </div>
                <span className="px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-400 text-xs font-semibold">{brandLabel}</span>
              </div>
              <p className="text-xs text-zinc-500 truncate mb-1.5">{shortAddr(r.location)}</p>
              <div className="flex items-center gap-3 text-xs tabular-nums">
                <span className="text-green-400 font-bold">{r.energy_kwh}<span className="text-zinc-600 ml-0.5">kWh</span></span>
                {r.max_power && (
                  <span className="text-rose-400 font-bold">{r.max_power}<span className="text-zinc-600 ml-0.5">kW</span><span className="text-zinc-700 ml-0.5">최대</span></span>
                )}
                {r.avg_power && (
                  <span className="text-zinc-400">{r.avg_power}<span className="text-zinc-600 ml-0.5">kW</span><span className="text-zinc-700 ml-0.5">평균</span></span>
                )}
                {r.min_power && (
                  <span className="text-zinc-500">{r.min_power}<span className="text-zinc-600 ml-0.5">kW</span><span className="text-zinc-700 ml-0.5">최소</span></span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
