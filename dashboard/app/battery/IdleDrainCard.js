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
  const avgIdleHours = records.length > 0 ? totalIdleHours / records.length : 0;
  const avgDrop = records.length > 0 ? (totalDrop / records.length).toFixed(1) : '0';
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
          <div className="text-sm font-extrabold tabular-nums text-zinc-300">{formatDuration(avgIdleHours)}</div>
          <div className="text-[9px] text-zinc-600 mt-0.5">{records.length}회 기준</div>
        </div>
        <div className="text-center py-3">
          <div className="text-[10px] text-zinc-600 mb-1">평균 손실</div>
          <div className="text-sm font-extrabold tabular-nums text-red-400">{avgDrop}%</div>
          <div className="text-[9px] text-zinc-600 mt-0.5">드레인 {withDrain.length}회</div>
        </div>
      </div>

      {/* 날짜별 그룹 리스트 */}
      {(() => {
        const getDateKey = (dateStr) => {
          const d = new Date(dateStr);
          const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
          return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}-${String(kst.getUTCDate()).padStart(2, '0')}`;
        };
        const formatDateLabel = (key) => {
          const [y, m, d] = key.split('-');
          const currentYear = new Date().getFullYear();
          const prefix = parseInt(y) !== currentYear ? `${String(y).slice(2)}/` : '';
          return `${prefix}${parseInt(m)}/${parseInt(d)}`;
        };

        const grouped = [];
        const seen = {};
        records.forEach(r => {
          const key = getDateKey(r.idle_start);
          if (!seen[key]) { seen[key] = []; grouped.push({ key, items: seen[key] }); }
          seen[key].push(r);
        });

        return grouped.map(({ key, items }) => {
          const dayIdleH = items.reduce((s, r) => s + r.idle_hours, 0);
          const dayDrop = items.reduce((s, r) => s + r.soc_drop, 0);
          return (
          <div key={key}>
            <div className="px-4 py-1.5 border-t border-white/[0.04] bg-white/[0.02] flex items-center justify-between">
              <span className="text-[10px] font-semibold text-zinc-500 tabular-nums">{formatDateLabel(key)}</span>
              <div className="flex items-center gap-2 tabular-nums">
                <span className="text-[10px] text-zinc-600">{formatDuration(dayIdleH)}</span>
                <span className={`text-[10px] font-bold ${dayDrop === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {dayDrop === 0 ? '0%' : `-${dayDrop}%`}
                </span>
              </div>
            </div>
            {items.map((r, i) => {
              const time = (() => {
                const d = new Date(r.idle_start);
                const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
                return `${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;
              })();
              return (
                <div key={i} className="flex items-center justify-between px-4 py-2.5 border-t border-white/[0.03]">
                  <span className="text-[10px] text-zinc-500 tabular-nums whitespace-nowrap">{time}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-zinc-600 tabular-nums whitespace-nowrap">{formatDuration(r.idle_hours)}</span>
                    <span className="text-[10px] text-zinc-600 tabular-nums">{r.soc_start}→{r.soc_end}%</span>
                    <span className={`text-[10px] font-bold tabular-nums ${r.soc_drop === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {r.soc_drop === 0 ? '0%' : `-${r.soc_drop}%`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          );
        });
      })()}
    </div>
  );
}
