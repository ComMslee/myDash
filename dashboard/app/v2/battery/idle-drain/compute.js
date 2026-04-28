// 순수 계산 함수 — React 훅·DOM 없음

// 드레인 용량 중 공조/센트리가 차지한 추정 기여 % — 시간 점유율 × 드레인%
// (시간 가중 단순 모델: 그 구간이 다른 구간과 동일 속도로 빠진다는 근사)
// 0.05% 미만은 null, 1자리 소수.
export function dropSharePct(minutes, idleHours, drop) {
  if (!idleHours || idleHours <= 0) return null;
  if (drop == null || drop <= 0) return null;
  const share = (minutes / (idleHours * 60)) * drop;
  if (share < 0.05) return null;
  return Math.round(share * 10) / 10;
}

// 3분 미만 노이즈 제외 임계(ms)
export const SENTRY_MIN_SPAN_MS = 180000;

// onlineSpans에서 climateSpans 겹침을 빼 센트리 의심 구간만 추출
// (3분 미만 잔여 구간은 노이즈로 제외)
export function computeSentrySpans(onlineSpans, climateSpans) {
  const out = [];
  for (const on of onlineSpans || []) {
    let pieces = [{ s: on.s, e: on.e }];
    for (const cs of climateSpans || []) {
      const next = [];
      for (const p of pieces) {
        if (cs.e <= p.s || cs.s >= p.e) { next.push(p); continue; }
        if (cs.s <= p.s && cs.e >= p.e) continue;
        if (cs.s > p.s) next.push({ s: p.s, e: Math.min(cs.s, p.e) });
        if (cs.e < p.e) next.push({ s: Math.max(cs.e, p.s), e: p.e });
      }
      pieces = next;
    }
    for (const p of pieces) {
      if (p.e - p.s >= SENTRY_MIN_SPAN_MS) out.push(p);
    }
  }
  return out;
}

export function sumSpansMin(spans) {
  return (spans || []).reduce((t, sp) => t + (sp.e - sp.s), 0) / 60000;
}
