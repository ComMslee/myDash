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

// P3 참고 섹션의 미니 그리드 — 동일한 그리드/셀 렌더링 중복 방지
export function MiniGrid({ chargers, statId, ranks, usage, now }) {
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${P3_GRID_COLS}, minmax(0, 1fr))` }}
    >
      {chargers.map(c => (
        <UnifiedCell
          key={c.chgerId}
          c={c}
          highlight={ranks.get(`${statId}_${c.chgerId}`) ?? null}
          count={usage[`${statId}_${c.chgerId}`]?.t ?? 0}
          now={now}
        />
      ))}
    </div>
  );
}

// 통일 셀 — 색 배경 + 번호, 하단에 경과 시간(충전중만), 랭크 링
export function UnifiedCell({ c, highlight, count, now, size = 'md' }) {
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
  const titleParts = [`${localId} · ${meta.label}`];
  if (elapsed) titleParts.push(`${elapsed} 경과`);
  if (count > 0) titleParts.push(`사용 ${count}회`);
  if (highlight) titleParts.push(highlight === 'high' ? '자주 사용' : '가끔 사용');
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-0">
      <div
        className={`${sizeClass} rounded-md flex items-center justify-center font-bold tabular-nums ${meta.cellBg} ${meta.cellText} ${ringClass}`}
        title={titleParts.join(' · ')}
      >
        {label}
      </div>
      <div className={`text-[9px] tabular-nums leading-none min-h-[10px] ${meta.text}`}>
        {elapsed}
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
        {chargers.map(c => (
          <UnifiedCell
            key={c.chgerId}
            c={c}
            highlight={ranks.get(keyOf(c)) ?? null}
            count={usage[keyOf(c)]?.t ?? 0}
            now={now}
            size="lg"
          />
        ))}
      </div>
    </div>
  );
}
