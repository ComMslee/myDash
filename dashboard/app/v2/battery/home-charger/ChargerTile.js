// 집충전기 셀/타일 프리미티브 — UnifiedCell, TileBox, StatusBadges, MiniGrid

import { ID_OFFSET, STAT_META, STATUS_ORDER } from './constants';
import { elapsedLabel, chargingFillPct } from './utils';

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

// 동일 카드 내 셀 wrap (115동 합성 카드 등에서 재사용)
export function MiniGrid({ chargers, statId, ranks, usage, now, className = '' }) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
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

// 통일 셀 — 44×60 세로 카드
//   border-2: 상태 색 (파스텔)
//   ring:     순위 (top1=골드 2px+glow / top3=앰버 1.5px / top10=앰버 1px 옅음)
//   inner fill: 충전중에만 (14h max scale, 아래→위)
//   상단: 번호 / 하단: 충전시간(충전중) | 누적회수(가용) | – (장애)
export function UnifiedCell({ c, highlight, count, hourly, now }) {
  const meta = STAT_META[c.stat] || STAT_META['9'];
  const localId = ID_OFFSET + Number(c.chgerId);
  const label = localId - 95100;
  const isCharging = c.stat === '3';
  const fillPct = chargingFillPct(c, now);
  const elapsed = elapsedLabel(c, now);
  const peak = peakHourOf(hourly);

  const ringClass =
    highlight?.tier === 'top1'  ? 'ring-2 ring-yellow-200 shadow-[0_0_8px_rgba(254,240,138,0.35)]' :
    highlight?.tier === 'top3'  ? 'ring-[1.5px] ring-amber-300' :
    highlight?.tier === 'top10' ? 'ring-1 ring-amber-400/40' :
    '';

  // 하단 info 텍스트
  const bottomText = isCharging ? elapsed
    : (c.stat === '9' || c.stat === '1') ? '–'
    : count > 0 ? String(count)
    : '';

  // 호버 툴팁 — 정보 손실 방지용 풀버전 유지
  const titleParts = [`${localId} · ${meta.label}`];
  if (elapsed) titleParts.push(`${elapsed} 경과`);
  titleParts.push(count > 0 ? `누적 ${count}회 사용` : '미사용');
  if (peak) titleParts.push(`피크 ${peak.hour}시 (${peak.count}회)`);
  if (highlight) titleParts.push(`${highlight.rank}위${highlight.tier !== 'top10' ? ' · 자주 사용' : ''}`);

  return (
    <div
      className={`relative w-11 h-[60px] rounded-[12px] overflow-hidden bg-white/[0.04] border-2 ${meta.border} ${ringClass} cursor-help`}
      title={titleParts.join(' · ')}
    >
      {isCharging && fillPct > 0 && (
        <div
          className={`absolute bottom-0 left-0 right-0 ${meta.fill} transition-[height] duration-500 ease-out`}
          style={{ height: `${fillPct}%` }}
        />
      )}
      <div className="relative z-10 pt-1 text-center text-sm font-bold tabular-nums text-zinc-100">
        {label}
      </div>
      <div className="absolute bottom-0.5 left-0 right-0 z-10 text-[9px] text-center tabular-nums text-zinc-400">
        {bottomText}
      </div>
    </div>
  );
}

// 카드 variant — 그룹 hierarchy 시각화
//   favorite: 즐겨찾기(108·107) — bg lift + sky 외곽
//   default:  단지 내 그 외 동
//   nearby:   refStations(단지 외) — dashed border
const VARIANT_CLS = {
  favorite: 'bg-white/[0.05] border border-sky-300/15',
  default:  'bg-[#1c1d20] border border-white/[0.06]',
  nearby:   'bg-[#161618] border border-dashed border-white/[0.06]',
};

// 동별 타일 박스 — 헤더(동번호) + 셀 wrap
export function TileBox({ title, chargers, ranks, usage, statId, now, variant = 'default' }) {
  if (!chargers.length) return null;
  const keyOf = (c) => `${statId}_${c.chgerId}`;
  const variantCls = VARIANT_CLS[variant] || VARIANT_CLS.default;
  return (
    <div className={`rounded-2xl p-3 ${variantCls}`}>
      <div className="text-[11px] text-zinc-400 font-semibold mb-2 px-0.5 tabular-nums">
        {title}
      </div>
      <div className="flex flex-wrap gap-1.5">
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
