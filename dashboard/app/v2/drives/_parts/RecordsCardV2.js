'use client';

import { formatDuration } from '@/lib/format';
import { useRankingsSheet } from '../../components/RankingsSheet';

function NewBadge() {
  return (
    <span className="text-[8px] font-bold px-1 py-px rounded bg-gradient-to-br from-blue-500 to-violet-500 text-white leading-none">NEW</span>
  );
}

export default function RecordsCardV2({ allTime }) {
  const { open } = useRankingsSheet();

  if (!allTime) return null;

  const km  = (v) => <>{v}<span className="text-zinc-600 text-[11px] ml-0.5 font-normal">km</span></>;
  const kmh = (v) => <>{v}<span className="text-zinc-600 text-[11px] ml-0.5 font-normal">km/h</span></>;
  const wh  = (v) => <>{v}<span className="text-zinc-600 text-[11px] ml-0.5 font-normal">Wh/km</span></>;

  const rows = [
    {
      label: '거리',
      color: 'text-blue-400',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      ),
      drive: { value: km(allTime.max_distance),     metric: 'distance', base: 'drive' },
      day:   { value: km(allTime.max_day_distance), metric: 'distance', base: 'day'   },
    },
    {
      label: '시간',
      color: 'text-zinc-200',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      drive: { value: formatDuration(allTime.max_duration),     metric: 'duration', base: 'drive' },
      day:   { value: formatDuration(allTime.max_day_duration), metric: 'duration', base: 'day'   },
    },
    {
      label: '속도',
      color: 'text-amber-400',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      drive: { value: kmh(allTime.avg_speed), metric: 'avg_speed', base: 'drive' },
      day:   { value: allTime.max_day_avg_speed != null ? kmh(allTime.max_day_avg_speed) : '—', metric: 'avg_speed', base: 'day' },
    },
    {
      label: '효율',
      color: 'text-emerald-400',
      isNew: true,
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      drive: { value: allTime.min_eff_wh_km != null ? wh(allTime.min_eff_wh_km) : '—', metric: 'eff', base: 'drive' },
      day:   { value: allTime.min_day_eff_wh_km != null ? wh(allTime.min_day_eff_wh_km) : '—', metric: 'eff', base: 'day'   },
    },
  ];

  const cellBase = 'py-3 text-center font-bold text-lg leading-none tabular-nums transition-colors rounded-lg cursor-pointer';

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-4 pt-3 pb-3">
        <div className="grid grid-cols-[40px_1fr_1fr] gap-1 pb-1">
          <div className="text-[9px] font-bold tracking-wider text-zinc-600 flex items-center justify-center">TOP 50</div>
          <div className="text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500">단일 주행</div>
          <div className="text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500">일 합계</div>
        </div>
        <div className="grid grid-cols-[40px_1fr_1fr] gap-1">
          {rows.flatMap((r, i) => [
            <div key={`l-${i}`} className={`flex flex-col items-center justify-center gap-0.5 ${r.color}`}>
              {r.icon}
              {r.isNew && <NewBadge />}
            </div>,
            <button
              key={`d-${i}`}
              onClick={() => open(r.drive.metric, r.drive.base)}
              className={`${cellBase} ${r.color} hover:bg-white/[0.04] active:bg-blue-500/10`}
            >
              {r.drive.value}
            </button>,
            <button
              key={`y-${i}`}
              onClick={() => open(r.day.metric, r.day.base)}
              className={`${cellBase} ${r.color} hover:bg-white/[0.04] active:bg-blue-500/10`}
            >
              {r.day.value}
            </button>,
          ])}
        </div>
      </div>
    </div>
  );
}
