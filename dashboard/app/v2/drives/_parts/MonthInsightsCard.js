'use client';

import { useRouter } from 'next/navigation';
import { effColor } from '@/lib/effColor';

function NewBadge() {
  return (
    <span className="text-[8px] font-bold px-1 py-px rounded bg-gradient-to-br from-blue-500 to-violet-500 text-white leading-none">NEW</span>
  );
}

export default function MonthInsightsCard({ insights }) {
  const router = useRouter();
  const longBest = insights?.current?.best_drive_long;
  const effBest = insights?.current?.best_drive_eff;
  if (!longBest && !effBest) return null;

  const fmtMD = (iso) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const Row = ({ iconSvg, iconColor, label, valueNode, dateStr, driveId }) => (
    <button
      onClick={() => router.push(`/v2/history?id=${driveId}`)}
      className="w-full flex items-center gap-2 px-3 py-3 hover:bg-white/[0.03] active:bg-blue-500/10 transition-colors text-left border-b border-white/[0.04] last:border-0"
    >
      <span className={`flex-shrink-0 ${iconColor}`}>{iconSvg}</span>
      <span className="text-xs text-zinc-400 font-semibold flex-shrink-0 whitespace-nowrap">{label}</span>
      <span className="flex-1 min-w-0 text-right tabular-nums whitespace-nowrap">{valueNode}</span>
      <span className="text-[11px] text-zinc-500 tabular-nums flex-shrink-0 text-right whitespace-nowrap">{dateStr}</span>
      <svg className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-3 py-2 border-b border-white/[0.06] flex items-center gap-2">
        <span className="text-[11px] font-bold tracking-widest uppercase text-zinc-500">이번달 인사이트</span>
        <NewBadge />
      </div>
      {longBest && (
        <Row
          iconSvg={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          }
          iconColor="text-blue-400"
          label="최장 주행"
          valueNode={<><span className="font-bold text-blue-400 text-base">{longBest.distance}</span><span className="text-xs text-zinc-600 ml-0.5">km</span></>}
          dateStr={fmtMD(longBest.start_date)}
          driveId={longBest.id}
        />
      )}
      {effBest && (
        <Row
          iconSvg={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
          iconColor="text-emerald-400"
          label="최고 효율"
          valueNode={<><span className="font-bold text-base" style={{ color: effColor(effBest.eff_wh_km) }}>{effBest.eff_wh_km}</span><span className="text-xs text-zinc-600 ml-0.5">Wh/km</span></>}
          dateStr={fmtMD(effBest.start_date)}
          driveId={effBest.id}
        />
      )}
    </div>
  );
}
