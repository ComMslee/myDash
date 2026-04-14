'use client';

function formatDuration(hours) {
  if (hours < 1) return `${Math.round(hours * 60)}분`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mi = String(kst.getUTCMinutes()).padStart(2, '0');
  const currentYear = new Date().getFullYear();
  const prefix = year !== currentYear ? `${String(year).slice(2)}/` : '';
  return `${prefix}${mm}/${dd} ${hh}:${mi}`;
}

export default function IdleDrainCard({ records }) {
  if (!records || records.length === 0) {
    return (
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-6 text-center">
        <div className="text-zinc-600 text-sm">대기 중 배터리 소모 데이터가 아직 없습니다</div>
      </div>
    );
  }

  const withDrain = records.filter(r => r.soc_drop > 0);
  const totalIdleHours = records.reduce((s, r) => s + r.idle_hours, 0);
  const totalDrop = records.reduce((s, r) => s + r.soc_drop, 0);
  const avgDrainPerDay = totalIdleHours > 0 ? (totalDrop / totalIdleHours * 24).toFixed(1) : '0';
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
          <div className="text-[10px] text-zinc-600 mb-1">총 대기</div>
          <div className="text-sm font-extrabold tabular-nums text-zinc-300">{formatDuration(totalIdleHours)}</div>
          <div className="text-[9px] text-zinc-600 mt-0.5">{records.length}회</div>
        </div>
        <div className="text-center py-3">
          <div className="text-[10px] text-zinc-600 mb-1">총 손실</div>
          <div className="text-sm font-extrabold tabular-nums text-red-400">{totalDrop}%</div>
          <div className="text-[9px] text-zinc-600 mt-0.5">드레인 {withDrain.length}회</div>
        </div>
      </div>

      {/* 최근 기록 리스트 */}
      {records.slice(0, 8).map((r, i) => {
        return (
          <div
            key={i}
            className="flex items-center justify-between px-4 py-2.5 border-t border-white/[0.04]"
          >
            <div className="min-w-0">
              <div className="text-[11px] text-zinc-400 whitespace-nowrap">{formatDate(r.idle_start)}</div>
              <div className="text-[9px] text-zinc-600 mt-0.5">{formatDuration(r.idle_hours)}</div>
            </div>
            <span className="text-[10px] tabular-nums text-zinc-500">
              {r.soc_start}→{r.soc_end}%
            </span>
            <span className={`text-[11px] font-bold tabular-nums ${r.soc_drop === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {r.soc_drop === 0 ? '0%' : `-${r.soc_drop}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
