// 집충전기 셀/타일 프리미티브 — UnifiedCell, TileBox, StatusBadges, MiniGrid

import { ID_OFFSET, STAT_META, STATUS_ORDER, P3_GRID_COLS } from './constants';
import { elapsedLabel } from './utils';

// 상태별 카운트 배지 — 헤더/요약에서 공용
// size: 'md'(헤더) | 'sm'(P3 요약)
export function StatusBadges({ counts, size = 'md' }) {
  const dotSize = size === 'sm' ? 'w-1 h-1' : 'w-1.5 h-1.5';
  return (
    <>
      {STATUS_ORDER.map(k => {
        const n = counts[k];
        if (!n) return null;
        const meta = STAT_META[k];
        return (
          <span key={k} className={`flex items-center gap-1 ${meta.text}`}>
            <span className={`${dotSize} rounded-full ${meta.dot}`} />
            {meta.label} {n}
          </span>
        );
      })}
    </>
  );
}

// 24시간 사용 히스토그램 배열에서 피크 시간대 찾기
function peakHourOf(hourly) {
  if (!hourly || !hourly.length) return null;
  let max = 0, idx = -1;
  for (let i = 0; i < hourly.length; i++) {
    if (hourly[i] > max) { max = hourly[i]; idx = i; }
  }
  return max > 0 ? { hour: idx, count: max } : null;
}

// P3 참고 섹션의 미니 그리드 — 동일한 그리드/셀 렌더링 중복 방지
export function MiniGrid({ chargers, statId, ranks, usage, now }) {
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${P3_GRID_COLS}, minmax(0, 1fr))` }}
    >
      {chargers.map(c => {
        const u = usage[`${statId}_${c.chgerId}`];
        return (
          <UnifiedCell
            key={c.chgerId}
            c={c}
            highlight={ranks.get(`${statId}_${c.chgerId}`) ?? null}
            count={u?.t ?? 0}
            hourly={u?.h ?? null}
            now={now}
          />
        );
      })}
    </div>
  );
}

// 통일 셀 — 색 배경 + 번호, 하단에 경과시간(충전중) 또는 사용횟수(비사용), 랭크 링
export function UnifiedCell({ c, highlight, count, hourly, now, size = 'md' }) {
  const meta = STAT_META[c.stat] || STAT_META['9'];
  const localId = ID_OFFSET + Number(c.chgerId);
  const label = localId - 95100;
  const sizeClass = size === 'lg'
    ? 'w-10 h-10 text-sm'
    : 'aspect-square text-[10px]';
  const ringClass = highlight === 'high'
    ? 'ring-1 ring-amber-400'
    : highlight === 'mid'
    ? 'ring-1 ring-amber-400/40'
    : '';
  const elapsed = elapsedLabel(c, now);
  const isCharging = c.stat === '3';
  const peak = peakHourOf(hourly);

  // 툴팁 — 항상 사용 횟수 표시 (0이면 "미사용")
  const titleParts = [`${localId} · ${meta.label}`];
  if (elapsed) titleParts.push(`${elapsed} 경과`);
  titleParts.push(count > 0 ? `누적 ${count}회 사용` : '미사용');
  if (peak) titleParts.push(`피크 ${peak.hour}시 (${peak.count}회)`);
  if (highlight) titleParts.push(highlight === 'high' ? '자주 사용' : '가끔 사용');

  // 셀 하단 텍스트 — 충전중이면 경과시간, 아니면 사용횟수 요약
  const bottomText = isCharging
    ? elapsed
    : count > 0 ? `×${count}` : '';
  const bottomClass = isCharging ? meta.text : 'text-zinc-500';

  return (
    <div className="flex flex-col items-center gap-0.5 min-w-0">
      <div
        className={`${sizeClass} rounded-md flex items-center justify-center font-bold tabular-nums cursor-help ${meta.cellBg} ${meta.cellText} ${ringClass}`}
        title={titleParts.join(' · ')}
      >
        {label}
      </div>
      <div className={`text-[9px] tabular-nums leading-none min-h-[10px] ${bottomClass}`}>
        {bottomText}
      </div>
    </div>
  );
}

// 동별 타일 박스 — 제목 + 셀들
export function TileBox({ title, chargers, ranks, usage, statId, now }) {
  if (!chargers.length) return null;
  const keyOf = (c) => `${statId}_${c.chgerId}`;
  return (
    <div className="flex-1 min-w-0 bg-[#1a1a1c] border border-white/[0.06] rounded-lg p-2">
      <div className="text-[10px] text-zinc-400 mb-1.5 font-medium text-center">{title}</div>
      <div className="flex justify-center items-start flex-wrap gap-1.5">
        {chargers.map(c => {
          const u = usage[keyOf(c)];
          return (
            <UnifiedCell
              key={c.chgerId}
              c={c}
              highlight={ranks.get(keyOf(c)) ?? null}
              count={u?.t ?? 0}
              hourly={u?.h ?? null}
              now={now}
              size="lg"
            />
          );
        })}
      </div>
    </div>
  );
}
