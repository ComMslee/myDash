// 집충전기 카드 순수 함수 — 랭크 계산, 시각 포맷, 툴팁 빌더

// 상위 25% → 'high', 25~50% → 'mid', 나머지 → null (동점은 같은 등급)
export function computeRanks(usage) {
  const entries = Object.entries(usage)
    .map(([id, d]) => ({ id, t: d.t }))
    .filter(e => e.t > 0)
    .sort((a, b) => b.t - a.t);
  if (!entries.length) return new Map();
  const hiIdx = Math.ceil(entries.length * 0.25) - 1;
  const miIdx = Math.ceil(entries.length * 0.50) - 1;
  const hiThreshold = entries[Math.min(hiIdx, entries.length - 1)].t;
  const miThreshold = entries[Math.min(miIdx, entries.length - 1)].t;
  const ranks = new Map();
  for (const e of entries) {
    if (e.t >= hiThreshold) ranks.set(e.id, 'high');
    else if (e.t >= miThreshold) ranks.set(e.id, 'mid');
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

// 충전중 셀의 경과 시간 라벨 ("32m" / "1h23")
export function elapsedLabel(c, now) {
  if (c.stat !== '3') return '';
  const startMs = parseKstDt(c.lastTsdt || c.statUpdDt);
  if (!startMs) return '';
  const m = Math.max(0, Math.floor((now - startMs) / 60000));
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}
