// 집충전기 카드 순수 함수 — 랭크 계산, 시각 포맷, 툴팁 빌더

// 순위 기반 링크 등급: 1위 → 'top1', 2~3위 → 'top3', 4~10위 → 'top10'
// 11위 이후 → null. 동점은 같은 rank 번호를 공유.
// 반환: Map<id, { tier: 'top1'|'top3'|'top10', rank: number }>
export function computeRanks(usage) {
  const entries = Object.entries(usage)
    .map(([id, d]) => ({ id, t: d.t }))
    .filter(e => e.t > 0)
    .sort((a, b) => b.t - a.t);
  if (!entries.length) return new Map();
  const ranks = new Map();
  let displayRank = 0;
  let prevT = null;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    // 동점 처리: 값이 다르면 다음 순위로, 같으면 같은 순위 유지
    if (prevT === null || e.t !== prevT) displayRank = i + 1;
    prevT = e.t;
    if (displayRank > 10) break;
    const tier = displayRank === 1 ? 'top1' : displayRank <= 3 ? 'top3' : 'top10';
    ranks.set(e.id, { tier, rank: displayRank });
  }
  return ranks;
}

// 폴링 주기 정보 → 마우스 오버 텍스트 (24시간 스케줄 6×4 그리드)
export function buildTtlTooltip(ttlInfo) {
  if (!ttlInfo) return '';
  const { dynamic, currentMin, currentHour, schedule } = ttlInfo;
  const lines = [];
  lines.push(`현재 ${currentHour}시 · 갱신 주기 ${currentMin}분`);
  lines.push(dynamic ? '자동 학습 (최근 90일 충전 패턴 기반)' : '기본 스케줄');
  lines.push('');
  for (let block = 0; block < 4; block++) {
    const row = [];
    for (let i = 0; i < 6; i++) {
      const h = block * 6 + i;
      const mark = h === currentHour ? '▶' : ' ';
      row.push(`${mark}${String(h).padStart(2)}시 ${String(schedule[h]).padStart(2)}분`);
    }
    lines.push(row.join('  '));
  }
  return lines.join('\n');
}

export function timeAgoKo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 10) return '방금';
  if (s < 60) return `${s}초 전`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

// "YYYYMMDDHHMMSS" (KST 포맷) → ms (UTC epoch)
export function parseKstDt(s) {
  if (!s || s.length < 14) return null;
  const y = +s.slice(0, 4), mo = +s.slice(4, 6) - 1, d = +s.slice(6, 8);
  const h = +s.slice(8, 10), mi = +s.slice(10, 12), se = +s.slice(12, 14);
  if (Number.isNaN(y) || Number.isNaN(mo) || Number.isNaN(d)) return null;
  return Date.UTC(y, mo, d, h - 9, mi, se);
}

// 충전중 셀의 경과 시간 라벨 (hh:mm — "0:32" / "1:23" / "12:05")
export function elapsedLabel(c, now) {
  if (c.stat !== '3') return '';
  const startMs = parseKstDt(c.lastTsdt || c.statUpdDt);
  if (!startMs) return '';
  const m = Math.max(0, Math.floor((now - startMs) / 60000));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

// 충전중 셀의 fill 비율 (0~100). 지수 점근 곡선 — (1 - e^(-h/7.8)) * 100.
// 4h = 40% 앵커로 튜닝. 짧은 세션도 보이되 4h 미만은 절반 이하, 그 이상은 점진 saturate.
// 참고값: 1h=12%, 2h=23%, 4h=40%, 6h=54%, 8h=64%, 12h=78%, 14h=83%.
export function chargingFillPct(c, now) {
  if (c.stat !== '3') return 0;
  const startMs = parseKstDt(c.lastTsdt || c.statUpdDt);
  if (!startMs) return 0;
  const h = Math.max(0, (now - startMs) / 3_600_000);
  return (1 - Math.exp(-h / 7.8)) * 100;
}
