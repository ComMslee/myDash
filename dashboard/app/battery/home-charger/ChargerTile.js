// 집충전기 셀/타일 프리미티브 — UnifiedCell, TileBox, StatusBadges, MiniGrid

import { ID_OFFSET, STAT_META, STATUS_ORDER } from './constants';
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

// P3 참고 섹션 — 셀 포맷은 P1/P2와 완전 동일, flex-wrap으로 자연 줄바꿈
export function MiniGrid({ chargers, statId, ranks, usage, now }) {
  return (
    <div className="flex flex-wrap gap-1.5">
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
// 모든 셀 크기/폰트 통일 (P1/P2/P3 동일 포맷)
export function UnifiedCell({ c, highlight, count, hourly, now }) {
  const meta = STAT_META[c.stat] || STAT_META['9'];
  const localId = ID_OFFSET + Number(c.chgerId);
  const label = localId - 95100;
  const sizeClass = 'w-10 h-10 text-sm';
  const ringClass = highlight === 'high'
    ? 'ring-2 ring-amber-300 shadow-[0_0_6px_rgba(252,211,77,0.6)]'
    : highlight === 'mid'
    ? 'ring-2 ring-amber-500/70'
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

  // 셀 하단 텍스트 — 충전중일 때만 경과시간 (누적 횟수는 호버에서 확인)
  const bottomText = isCharging ? elapsed : '';
  const bottomClass = meta.text;

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

// 동별 타일 박스 — 왼쪽에 동 이름, 오른쪽에 셀 나열
export function TileBox({ title, chargers, ranks, usage, statId, now }) {
  if (!chargers.length) return null;
  const keyOf = (c) => `${statId}_${c.chgerId}`;
  return (
    <div className="bg-[#1a1a1c] border border-white/[0.06] rounded-lg p-2 flex items-center gap-2">
      <div className="text-[11px] text-zinc-300 font-medium shrink-0 flex flex-col items-center leading-none tabular-nums">
        {Array.from(String(title)).map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="flex items-start flex-wrap gap-1.5 flex-1 min-w-0">
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
            />
          );
        })}
      </div>
    </div>
  );
}
