'use client';

import { formatHours } from '@/lib/format';
import { toKstDate, formatHM } from '@/lib/kst';
import { useIdleDrainDays } from './useIdleDrainDays';

export default function IdleDrainCard({ records, chargingSessions = [] }) {
  const { grouped, chargingByDay, stats } = useIdleDrainDays(records, chargingSessions);

  if (!stats) {
    return (
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-6 text-center">
        <div className="text-zinc-600 text-sm">대기 중 배터리 소모 데이터가 아직 없습니다</div>
      </div>
    );
  }

  const { avgDrainPerDay, avgIdleHours, avgDrop, withDrainCount, totalRecords } = stats;
  const fmtDrop = (n) => (Math.round(n * 10) / 10).toString();

  // 일자 라벨 포맷 (올해면 연도 생략)
  const formatDateLabel = (key) => {
    const [y, m, d] = key.split('-');
    const currentYear = new Date().getFullYear();
    const prefix = parseInt(y) !== currentYear ? `${String(y).slice(2)}/` : '';
    return `${prefix}${parseInt(m)}/${parseInt(d)}`;
  };

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      {/* 요약 */}
      <div className="grid grid-cols-3 border-b border-white/[0.06]">
        <div className="text-center py-3 border-r border-white/[0.06]">
          <div className="text-[10px] text-zinc-600 mb-1">일평균 손실</div>
          <div className="text-sm font-extrabold tabular-nums text-amber-400">{avgDrainPerDay}%</div>
          <div className="text-[9px] text-zinc-600 mt-0.5">/일</div>
        </div>
        <div className="text-center py-3 border-r border-white/[0.06]">
          <div className="text-[10px] text-zinc-600 mb-1">평균 대기</div>
          <div className="text-sm font-extrabold tabular-nums text-zinc-300">{formatHours(avgIdleHours)}</div>
          <div className="text-[9px] text-zinc-600 mt-0.5">{totalRecords}회 기준</div>
        </div>
        <div className="text-center py-3">
          <div className="text-[10px] text-zinc-600 mb-1">평균 손실</div>
          <div className="text-sm font-extrabold tabular-nums text-red-400">{avgDrop}%</div>
          <div className="text-[9px] text-zinc-600 mt-0.5">드레인 {withDrainCount}회</div>
        </div>
      </div>

      {/* 날짜별 그룹 리스트 */}
      {grouped.map(({ key, items }) => {
        const dayIdleH = items.reduce((s, r) => s + r.idle_hours, 0);
        const dayDropRaw = items.reduce((s, r) => s + r.soc_drop, 0);
        const dayDrop = Math.round(dayDropRaw * 10) / 10;
        return (
          <div key={key} className="border-t border-white/[0.04]">
            <div className="px-4 py-1.5 bg-white/[0.02] flex items-center justify-between">
              <span className="text-[10px] font-semibold text-zinc-500 tabular-nums">{formatDateLabel(key)}</span>
              <div className="flex items-center gap-2 tabular-nums">
                <span className="text-[10px] text-zinc-600">{formatHours(dayIdleH)}</span>
                <span className={`text-[10px] font-bold ${dayDrop < 0.05 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {dayDrop < 0.05 ? '0%' : `-${fmtDrop(dayDrop)}%`}
                </span>
              </div>
            </div>
            <div className="px-4 py-2.5">
              {/* 24h 타임라인 — 비대기 구간은 회색으로 */}
              <div className="relative w-full h-6 rounded-md overflow-hidden bg-white/[0.05]">
                {items.map((r, i) => {
                  const kstStart = toKstDate(r.idle_start);
                  const hourOffset = kstStart.getUTCHours() + kstStart.getUTCMinutes() / 60 + kstStart.getUTCSeconds() / 3600;
                  const leftPct = (hourOffset / 24) * 100;
                  const visibleH = Math.min(24 - hourOffset, r.idle_hours);
                  const widthPct = (visibleH / 24) * 100;
                  if (widthPct <= 0) return null;
                  const isZero = r.soc_drop < 0.05;
                  const isPreCharge = r.next_type === 'charge';
                  const bg = isZero
                    ? (isPreCharge ? 'rgba(234,179,8,0.3)' : 'rgba(16,185,129,0.3)')
                    : (isPreCharge ? 'rgba(234,179,8,0.85)' : 'rgba(239,68,68,0.85)');
                  const showLabel = widthPct >= 10;
                  return (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 flex items-center justify-center text-[9px] font-bold tabular-nums text-white/90"
                      style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: bg }}
                      title={`${formatHM(r.idle_start)}~${r.idle_end ? formatHM(r.idle_end) : '현재'} · ${formatHours(r.idle_hours)} · ${r.soc_start}→${r.soc_end}% · ${isZero ? '0%' : `-${fmtDrop(r.soc_drop)}%`}${isPreCharge ? ' · ⚡충전 전 대기' : ''}`}
                    >
                      {showLabel ? (isZero ? '0' : `-${fmtDrop(r.soc_drop)}%`) : ''}
                    </div>
                  );
                })}
                {/* 충전 세션 (노랑) */}
                {(chargingByDay[key] || []).map((c, ci) => {
                  const kstStart = toKstDate(c.start);
                  const hourOffset = kstStart.getUTCHours() + kstStart.getUTCMinutes() / 60 + kstStart.getUTCSeconds() / 3600;
                  const leftPct = (hourOffset / 24) * 100;
                  const visibleH = Math.min(24 - hourOffset, c.hours);
                  const widthPct = (visibleH / 24) * 100;
                  if (widthPct <= 0) return null;
                  return (
                    <div
                      key={`c-${ci}`}
                      className="absolute top-0 bottom-0 flex items-center justify-center"
                      style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: 'rgba(234,179,8,0.9)' }}
                      title={`충전 ${formatHM(c.start)}~${formatHM(c.end)} · ${formatHours(c.hours)} · ${c.soc_start}→${c.soc_end}% (+${c.soc_added}%)`}
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="#18181b" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                      </svg>
                    </div>
                  );
                })}
                {/* 6·12·18시 가이드라인 */}
                {[6, 12, 18].map(h => (
                  <div key={h} className="absolute top-0 bottom-0 w-px bg-white/10 pointer-events-none" style={{ left: `${(h / 24) * 100}%` }} />
                ))}
              </div>
              <div className="flex justify-between mt-1 text-[9px] tabular-nums text-zinc-600">
                <span>0</span>
                <span>6</span>
                <span>12</span>
                <span>18</span>
                <span>24시</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
