'use client';

import { useState, useEffect } from 'react';
import { formatDuration, shortAddr } from '@/lib/format';

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
        <p className="text-zinc-600 text-sm">완속 충전 기록이 없습니다</p>
      </div>
    );
  }

  const records = data.records;

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <span className="text-xs font-bold text-zinc-200">완속 충전 기록</span>
        <span className="text-xs text-zinc-600">{records.length}건</span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: '360px' }}>
        {records.map(r => {
          const dt = new Date(r.start_date);
          const dateLabel = `${dt.getMonth()+1}/${dt.getDate()}`;
          const timeLabel = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;

          return (
            <div key={r.id} className="px-4 py-3 border-b border-white/[0.06] last:border-0">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-zinc-300 font-bold tabular-nums flex-shrink-0">{dateLabel}</span>
                  <span className="text-xs text-zinc-500 tabular-nums flex-shrink-0">{timeLabel}</span>
                  {r.duration_min && <span className="text-xs text-zinc-600 tabular-nums flex-shrink-0">{formatDuration(r.duration_min)}</span>}
                </div>
                <span className="text-xs text-zinc-400 truncate text-right">{shortAddr(r.location)}</span>
              </div>
              <div className="flex items-center gap-3 text-xs tabular-nums flex-wrap">
                <span className="text-emerald-400 font-bold">{r.energy_kwh}<span className="text-zinc-600 ml-0.5">kWh</span></span>
                {r.soc_start != null && r.soc_end != null && (
                  <span className="text-zinc-400">{r.soc_start}<span className="text-zinc-600">→</span>{r.soc_end}<span className="text-zinc-600 ml-0.5">%</span></span>
                )}
                {r.max_power && (
                  <span className="text-emerald-400/80 font-bold">{r.max_power}<span className="text-zinc-700 ml-0.5">최대</span></span>
                )}
                {r.min_power && (
                  <span className="text-zinc-500">{r.min_power}<span className="text-zinc-700 ml-0.5">최소</span></span>
                )}
                {r.avg_power && (
                  <span className="text-zinc-400">{r.avg_power}<span className="text-zinc-700 ml-0.5">평균</span></span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
