// 집충전기 셀/타일 프리미티브 — UnifiedCell, TileBox, StatusBadges, MiniGrid

import { ID_OFFSET, OVERDUE_THRESHOLD_H, STAT_META, STATUS_ORDER } from './constants';
import { chargingFillPct, chargingHours, elapsedLabel } from './utils';
import { Icon } from '../../../lib/Icons';

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
    <div className={`flex flex-wrap gap-2 ${className}`}>
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
//   inner fill: 충전중에만 (지수 점근 곡선 — utils.chargingFillPct, 아래→위)
//   상단: 번호 / 하단: 충전시간(충전중) | 누적회수(가용) | – (장애)
//   14h+: 비정상 점유 경고 — fill/외곽선/하단시간 amber 톤 전환
export function UnifiedCell({ c, highlight, count, hourly, now, numberPrefix = '' }) {
  const meta = STAT_META[c.stat] || STAT_META['9'];
  const localId = ID_OFFSET + Number(c.chgerId);
  const label = localId - 95100;
  const isCharging = c.stat === '3';
  const fillPct = chargingFillPct(c, now);
  const elapsed = elapsedLabel(c, now);
  const peak = peakHourOf(hourly);
  const overdue = isCharging && chargingHours(c, now) >= OVERDUE_THRESHOLD_H;
  const fillCls = overdue ? 'bg-orange-400/45' : meta.fill;
  const borderCls = overdue ? 'border-orange-300' : meta.border;
  const bottomCls = isCharging
    ? overdue ? 'text-[10px] font-bold text-orange-300' : 'text-[10px] font-semibold text-zinc-100'
    : (c.stat === '9' || c.stat === '1') ? 'text-[10px] text-zinc-500'
    : 'text-[6px] text-zinc-500';
  // 비정상 점유 — orange fill 위에 사선 stripe 패턴으로 시각 분리
  const fillStyle = overdue
    ? { backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0 4px, transparent 4px 9px)' }
    : undefined;

  const ringClass =
    highlight?.tier === 'top1'  ? 'ring-4 ring-yellow-200 shadow-[0_0_8px_rgba(254,240,138,0.35)]' :
    highlight?.tier === 'top3'  ? 'ring-4 ring-amber-300' :
    highlight?.tier === 'top10' ? 'ring-4 ring-amber-400/60' :
    '';

  // 1/2/3위 메달 — 색상으로 등급 구분(gold/silver/bronze).
  const medalColor =
    highlight?.rank === 1 ? 'text-yellow-300' :
    highlight?.rank === 2 ? 'text-zinc-300' :
    highlight?.rank === 3 ? 'text-amber-600' : null;

  // 하단 info 텍스트 — 충전중 경과시간 / 장애 '–' 만 표시.
  // 누적 카운트는 정보 과부하라 제거 (툴팁/사용 순위에서 확인).
  const bottomText = isCharging ? elapsed
    : (c.stat === '9' || c.stat === '1') ? '–'
    : '';

  // 호버 툴팁 — 정보 손실 방지용 풀버전 유지
  const titleParts = [`${localId} · ${meta.label}`];
  if (elapsed) titleParts.push(`${elapsed} 경과`);
  if (overdue) titleParts.push(`⚠ ${OVERDUE_THRESHOLD_H}h 초과 점유`);
  titleParts.push(count > 0 ? `누적 ${count}회 사용` : '미사용');
  if (peak) titleParts.push(`피크 ${peak.hour}시 (${peak.count}회)`);
  if (highlight) titleParts.push(`${highlight.rank}위${highlight.tier !== 'top10' ? ' · 자주 사용' : ''}`);

  return (
    <div
      className={`relative w-[52px] h-[60px] rounded-[12px] ${meta.body} border-2 ${borderCls} ${ringClass} cursor-help`}
      title={titleParts.join(' · ')}
    >
      {isCharging && fillPct > 0 && (
        <div className="absolute inset-0 rounded-[10px] overflow-hidden pointer-events-none">
          <div
            className={`absolute bottom-0 left-0 right-0 ${fillCls} transition-[height] duration-500 ease-out`}
            style={{ height: `${fillPct}%`, ...fillStyle }}
          />
        </div>
      )}
      {medalColor && (
        <div className={`absolute -top-2.5 -right-2.5 z-20 ${medalColor} drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]`}>
          <Icon name="medal" filled className="w-6 h-6" />
        </div>
      )}
      <div className={`relative z-10 pt-1 text-center text-lg font-bold tabular-nums ${meta.num}`}>
        {numberPrefix}{label}
      </div>
      <div className={`absolute bottom-0.5 left-0 right-0 z-10 text-center tabular-nums ${bottomCls}`}>
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

// 동별 타일 박스 — 좌측 세로 라벨(동 번호 digit stack) + 우측 셀 wrap
// 헤더 row 제거 + 가로 인라인 칩 대신 세로 스트립으로 → 셀 영역 최대 확보.
export function TileBox({ title, chargers, ranks, usage, statId, now, variant = 'default', className = '' }) {
  if (!chargers.length) return null;
  const keyOf = (c) => `${statId}_${c.chgerId}`;
  const variantCls = VARIANT_CLS[variant] || VARIANT_CLS.default;
  return (
    <div className={`rounded-2xl p-3 ${variantCls} ${className} flex items-start gap-2`}>
      <div
        className="shrink-0 flex flex-col items-center gap-0.5 px-1 py-1 rounded-md bg-zinc-700/70 text-zinc-100 font-bold text-[11px] tabular-nums leading-none"
        title={String(title)}
        aria-label={String(title)}
      >
        {String(title).split('').map((ch, i) => <span key={i}>{ch}</span>)}
      </div>
      <div className="flex flex-wrap gap-2 flex-1 min-w-0">
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
