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

export default function IdleDrainCard({ records, chargingSessions = [] }) {
  if (!records || records.length === 0) {
    return (
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-6 text-center">
        <div className="text-zinc-600 text-sm">대기 중 배터리 소모 데이터가 아직 없습니다</div>
      </div>
    );
  }

  // 자정(KST) 넘어가는 idle 세션은 각 날짜로 분할
  const expandedRecords = [];
  records.forEach(r => {
    const startMs = new Date(r.idle_start).getTime();
    const endMs = r.idle_end ? new Date(r.idle_end).getTime() : Date.now();
    if (endMs <= startMs) return;
    const totalMs = endMs - startMs;
    const totalDrop = r.soc_drop || 0;
    let cursor = startMs;
    while (cursor < endMs) {
      const kstCursor = new Date(cursor + 9 * 3600 * 1000);
      // 다음 KST 자정 (UTC ms)
      const nextKstMidnight = Date.UTC(
        kstCursor.getUTCFullYear(),
        kstCursor.getUTCMonth(),
        kstCursor.getUTCDate() + 1
      ) - 9 * 3600 * 1000;
      const segEnd = Math.min(endMs, nextKstMidnight);
      const segMs = segEnd - cursor;
      const segRatio = segMs / totalMs;
      const segDrop = Math.round(totalDrop * segRatio * 10) / 10;
      const socStart = r.soc_start != null ? r.soc_start - totalDrop * ((cursor - startMs) / totalMs) : null;
      const socEnd = r.soc_start != null ? r.soc_start - totalDrop * ((segEnd - startMs) / totalMs) : null;
      expandedRecords.push({
        idle_start: new Date(cursor).toISOString(),
        idle_end: new Date(segEnd).toISOString(),
        idle_hours: segMs / 3600000,
        soc_drop: segDrop,
        soc_start: socStart != null ? Math.round(socStart * 10) / 10 : null,
        soc_end: socEnd != null ? Math.round(socEnd * 10) / 10 : null,
        next_type: r.next_type,
      });
      cursor = segEnd;
    }
  });

  // 충전 세션도 자정 기준 분할 후 KST 일자별 그룹화
  const chargingByDay = {};
  chargingSessions.forEach(c => {
    const startMs = new Date(c.start).getTime();
    const endMs = c.end ? new Date(c.end).getTime() : Date.now();
    if (endMs <= startMs) return;
    let cursor = startMs;
    while (cursor < endMs) {
      const kstCursor = new Date(cursor + 9 * 3600 * 1000);
      const nextKstMidnight = Date.UTC(
        kstCursor.getUTCFullYear(),
        kstCursor.getUTCMonth(),
        kstCursor.getUTCDate() + 1
      ) - 9 * 3600 * 1000;
      const segEnd = Math.min(endMs, nextKstMidnight);
      const kstDay = `${kstCursor.getUTCFullYear()}-${String(kstCursor.getUTCMonth() + 1).padStart(2, '0')}-${String(kstCursor.getUTCDate()).padStart(2, '0')}`;
      if (!chargingByDay[kstDay]) chargingByDay[kstDay] = [];
      chargingByDay[kstDay].push({
        start: new Date(cursor).toISOString(),
        end: new Date(segEnd).toISOString(),
        hours: (segEnd - cursor) / 3600000,
        soc_start: c.soc_start,
        soc_end: c.soc_end,
        soc_added: c.soc_added,
      });
      cursor = segEnd;
    }
  });

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

        const seen = {};
        expandedRecords.forEach(r => {
          const key = getDateKey(r.idle_start);
          if (!seen[key]) seen[key] = [];
          seen[key].push(r);
        });
        // 충전만 있는 날짜도 포함
        Object.keys(chargingByDay).forEach(k => { if (!seen[k]) seen[k] = []; });
        // 각 일자 내 idle_start 역순 + 일자별 키 역순
        Object.values(seen).forEach(items =>
          items.sort((a, b) => new Date(b.idle_start) - new Date(a.idle_start))
        );
        const grouped = Object.keys(seen)
          .sort((a, b) => b.localeCompare(a))
          .map(key => ({ key, items: seen[key] }));

        const fmtDrop = (n) => (Math.round(n * 10) / 10).toString();
        return grouped.map(({ key, items }) => {
          const dayIdleH = items.reduce((s, r) => s + r.idle_hours, 0);
          const dayDropRaw = items.reduce((s, r) => s + r.soc_drop, 0);
          const dayDrop = Math.round(dayDropRaw * 10) / 10;
          const formatHM = (dateStr) => {
            const d = new Date(dateStr);
            const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
            return `${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;
          };
          // 드레인 속도 최댓값(해당 일 기준)으로 색 농도 정규화
          const maxRate = items.length > 0
            ? Math.max(0.1, ...items.map(r => r.idle_hours > 0 ? r.soc_drop / r.idle_hours : 0))
            : 0.1;
          return (
            <div key={key} className="border-t border-white/[0.04]">
              <div className="px-4 py-1.5 bg-white/[0.02] flex items-center justify-between">
                <span className="text-[10px] font-semibold text-zinc-500 tabular-nums">{formatDateLabel(key)}</span>
                <div className="flex items-center gap-2 tabular-nums">
                  <span className="text-[10px] text-zinc-600">{formatDuration(dayIdleH)}</span>
                  <span className={`text-[10px] font-bold ${dayDrop < 0.05 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {dayDrop < 0.05 ? '0%' : `-${fmtDrop(dayDrop)}%`}
                  </span>
                </div>
              </div>
              <div className="px-4 py-2.5">
                {/* 24h 타임라인 — 비대기 구간은 회색으로 */}
                <div className="relative w-full h-6 rounded-md overflow-hidden bg-white/[0.05]">
                  {items.map((r, i) => {
                    const start = new Date(r.idle_start);
                    const kstStart = new Date(start.getTime() + 9 * 60 * 60 * 1000);
                    const hourOffset = kstStart.getUTCHours() + kstStart.getUTCMinutes() / 60 + kstStart.getUTCSeconds() / 3600;
                    const leftPct = (hourOffset / 24) * 100;
                    const visibleH = Math.min(24 - hourOffset, r.idle_hours);
                    const widthPct = (visibleH / 24) * 100;
                    if (widthPct <= 0) return null;
                    const rate = r.idle_hours > 0 ? r.soc_drop / r.idle_hours : 0;
                    const isZero = r.soc_drop < 0.05;
                    const isPreCharge = r.next_type === 'charge';
                    const intensity = isZero ? 0 : Math.max(0.35, Math.min(1, rate / maxRate));
                    const bg = isZero
                      ? (isPreCharge ? 'rgba(234,179,8,0.3)' : 'rgba(16,185,129,0.3)')
                      : (isPreCharge ? `rgba(234,179,8,${intensity})` : `rgba(239,68,68,${intensity})`);
                    const showLabel = widthPct >= 10;
                    return (
                      <div
                        key={i}
                        className="absolute top-0 bottom-0 flex items-center justify-center text-[9px] font-bold tabular-nums text-white/90"
                        style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: bg }}
                        title={`${formatHM(r.idle_start)}~${r.idle_end ? formatHM(r.idle_end) : '현재'} · ${formatDuration(r.idle_hours)} · ${r.soc_start}→${r.soc_end}% · ${isZero ? '0%' : `-${fmtDrop(r.soc_drop)}%`}${isPreCharge ? ' · ⚡충전 전 대기' : ''}`}
                      >
                        {showLabel ? (isZero ? '0' : `-${fmtDrop(r.soc_drop)}%`) : ''}
                      </div>
                    );
                  })}
                  {/* 충전 세션 (노랑) */}
                  {(chargingByDay[key] || []).map((c, ci) => {
                    const st = new Date(c.start);
                    const kstStart = new Date(st.getTime() + 9 * 3600 * 1000);
                    const hourOffset = kstStart.getUTCHours() + kstStart.getUTCMinutes() / 60 + kstStart.getUTCSeconds() / 3600;
                    const leftPct = (hourOffset / 24) * 100;
                    const visibleH = Math.min(24 - hourOffset, c.hours);
                    const widthPct = (visibleH / 24) * 100;
                    if (widthPct <= 0) return null;
                    const showLabel = widthPct >= 8;
                    return (
                      <div
                        key={`c-${ci}`}
                        className="absolute top-0 bottom-0 flex items-center justify-center text-[9px] font-bold tabular-nums text-black/85"
                        style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: 'rgba(234,179,8,0.85)' }}
                        title={`⚡ 충전 ${formatHM(c.start)}~${formatHM(c.end)} · ${formatDuration(c.hours)} · ${c.soc_start}→${c.soc_end}% (+${c.soc_added}%)`}
                      >
                        {showLabel ? `⚡+${c.soc_added}%` : '⚡'}
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
        });
      })()}
    </div>
  );
}
