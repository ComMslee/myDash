// RecordsHabit.js

function formatKorDate(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).split('T')[0].split('-');
  const year = parseInt(parts[0]);
  const mm = String(parseInt(parts[1])).padStart(2, '0');
  const dd = String(parseInt(parts[2])).padStart(2, '0');
  const currentYear = new Date().getFullYear();
  return year !== currentYear ? `${String(year).slice(2)}/${mm}/${dd}` : `${mm}/${dd}`;
}

function HistBar({ counts, color }) {
  const total = counts.reduce((a, b) => a + b, 0);
  const maxCount = Math.max(1, ...counts);
  const maxH = 56;
  const maxIdx = counts.indexOf(maxCount);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 py-4 text-zinc-600">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9h.01M15 9h.01" />
          <path d="M9 15s1 1 3 1 3-1 3-1" />
        </svg>
        <span className="text-[10px]">충전 기록이 없어요</span>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-0.5" style={{ height: maxH }}>
      {counts.map((cnt, i) => {
        const h = maxCount > 0 ? Math.max(2, Math.round((cnt / maxCount) * maxH)) : 2;
        const isModal = i === maxIdx && cnt > 0;
        return (
          <div key={i} className="flex-1 rounded-t-sm transition-all duration-500"
            style={{
              height: h,
              background: isModal ? color : color,
              opacity: cnt === 0 ? 0.12 : isModal ? 1 : 0.55,
              outline: isModal ? `1.5px solid ${color}` : 'none',
            }}
            title={`${i * 10}–${i * 10 + 10}%: ${cnt}회`}
          />
        );
      })}
    </div>
  );
}

export function DailyRecordsCard({ records }) {
  const cells = [
    {
      icon: '🔋',
      label: '가장 많이 충전',
      data: records.max_charge,
      mainVal: records.max_charge ? `${records.max_charge.kwh} kWh` : null,
      subVal: records.max_charge ? `+${records.max_charge.charge_pct}%` : null,
      valClass: 'text-emerald-400',
      accentClass: 'bg-emerald-500',
    },
    {
      icon: '⚡',
      label: '가장 많이 소비',
      data: records.max_consume,
      mainVal: records.max_consume ? `${records.max_consume.consume_kwh} kWh` : null,
      subVal: records.max_consume ? `-${records.max_consume.consume_pct}%` : null,
      valClass: 'text-blue-400',
      accentClass: 'bg-blue-500',
    },
    {
      icon: '💤',
      label: '가장 적게 충전',
      data: records.min_charge,
      mainVal: records.min_charge ? `${records.min_charge.kwh} kWh` : null,
      subVal: records.min_charge ? `+${records.min_charge.charge_pct}%` : null,
      valClass: 'text-emerald-300',
      accentClass: 'bg-emerald-500',
    },
    {
      icon: '🛑',
      label: '가장 적게 소비',
      data: records.min_consume,
      mainVal: records.min_consume ? `${records.min_consume.consume_kwh} kWh` : null,
      subVal: records.min_consume ? `-${records.min_consume.consume_pct}%` : null,
      valClass: 'text-blue-300',
      accentClass: 'bg-blue-500',
    },
  ];

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">일간 최고 기록</span>
      </div>
      <div className="grid grid-cols-2">
        {cells.map((c, i) => {
          const hasData = !!c.data;
          const date = hasData ? formatKorDate(c.data.date) : null;
          const isLeft = i % 2 === 0;
          const isTop = i < 2;

          return (
            <div
              key={i}
              className={[
                'relative px-4 py-3.5',
                isLeft ? 'border-r' : '',
                isTop ? 'border-b' : '',
                'border-white/[0.06]',
                !hasData ? 'opacity-50' : '',
              ].join(' ')}
            >
              <div
                className={`absolute top-0 ${isLeft ? 'left-0 right-0' : 'left-0 right-0'} h-[2px] ${c.accentClass} opacity-60`}
              />
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className={`text-base ${!hasData ? 'grayscale' : ''}`}>{c.icon}</span>
                <span className="text-[9px] uppercase tracking-wider text-zinc-600">{c.label}</span>
              </div>
              {hasData ? (
                <>
                  <div className="text-[11px] text-zinc-400 mb-0.5 tabular-nums">{date}</div>
                  <div className={`text-xl font-black leading-none tabular-nums ${c.valClass}`}>{c.mainVal}</div>
                  <div className="text-[10px] text-zinc-500 mt-1 tabular-nums">{c.subVal}</div>
                </>
              ) : (
                <>
                  <div className="text-[10px] text-zinc-600 mb-0.5">기록 없음</div>
                  <div className="text-xl font-black leading-none text-zinc-700">—</div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LevelHabitCard({ histogram }) {
  const { start_level, end_level, start_modal_range, end_modal_range } = histogram;
  const labels = ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100%'];

  const startTotal = start_level.reduce((a, b) => a + b, 0);
  const endTotal = end_level.reduce((a, b) => a + b, 0);

  const startMaxIdx = start_level.indexOf(Math.max(...start_level));
  const endMaxIdx = end_level.indexOf(Math.max(...end_level));

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-4 py-3.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-1.5 mb-3">
          <div className="w-2 h-2 rounded-full bg-red-400" />
          <span className="text-[11px] font-semibold text-zinc-300">충전 시작 레벨</span>
          {startTotal > 0 && (
            <span className="ml-1 text-[10px] text-zinc-600">(총 {startTotal}회)</span>
          )}
        </div>
        <HistBar counts={start_level} color="#f87171" />
        {startTotal > 0 && (
          <>
            <div className="flex justify-between mt-1.5">
              {labels.map((l, i) => (
                <span
                  key={i}
                  className="text-[8px] tabular-nums"
                  style={{
                    color: i < 10 && i === startMaxIdx && start_level[i] > 0
                      ? '#f87171'
                      : '#3f3f46',
                  }}
                >
                  {l}
                </span>
              ))}
            </div>
            <div className="mt-2 text-[10px] text-zinc-600">
              주로 <span className="text-zinc-300 font-semibold">{start_modal_range}</span> 구간에서 충전 시작
            </div>
          </>
        )}
      </div>
      <div className="px-4 py-3.5">
        <div className="flex items-center gap-1.5 mb-3">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-[11px] font-semibold text-zinc-300">충전 종료 레벨</span>
          {endTotal > 0 && (
            <span className="ml-1 text-[10px] text-zinc-600">(총 {endTotal}회)</span>
          )}
        </div>
        <HistBar counts={end_level} color="#34d399" />
        {endTotal > 0 && (
          <>
            <div className="flex justify-between mt-1.5">
              {labels.map((l, i) => (
                <span
                  key={i}
                  className="text-[8px] tabular-nums"
                  style={{
                    color: i < 10 && i === endMaxIdx && end_level[i] > 0
                      ? '#34d399'
                      : '#3f3f46',
                  }}
                >
                  {l}
                </span>
              ))}
            </div>
            <div className="mt-2 text-[10px] text-zinc-600">
              주로 <span className="text-zinc-300 font-semibold">{end_modal_range}</span> 구간에서 충전 종료
            </div>
          </>
        )}
      </div>
    </div>
  );
}
