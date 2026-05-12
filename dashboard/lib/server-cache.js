// 서버 사이드 메모리 TTL 캐시 — 무거운 풀스캔 라우트용
//
// 사용 패턴:
//   const data = await withCache('insights:default', 60_000, async () => {
//     // 기존 핸들러 본문 — 데이터 객체 반환
//   }, { force: url.searchParams.get('refresh') === '1' });
//
// 특징:
// - 모듈 스코프 Map (프로세스당 단일 인스턴스 — 컨테이너 재시작 시 자연 무효화)
// - inflight 중복 호출 dedup (TTL 만료 직후 동시 요청 → 1회만 DB 쿼리)
// - per-key TTL — 라우트별로 다른 신선도 정책 적용

const cache = new Map();    // key → { ts, ttl, data }
const inflight = new Map(); // key → Promise

export async function withCache(key, ttlMs, fn, opts = {}) {
  const now = Date.now();
  const hit = cache.get(key);
  if (!opts.force && hit && (now - hit.ts) < hit.ttl) return hit.data;
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = (async () => {
    try {
      const data = await fn();
      cache.set(key, { ts: Date.now(), ttl: ttlMs, data });
      return data;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export function invalidate(prefix) {
  let n = 0;
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) { cache.delete(k); n++; }
  }
  return n;
}

export function cacheStats() {
  const now = Date.now();
  return Array.from(cache.entries()).map(([key, v]) => ({
    key,
    ageMs: now - v.ts,
    ttlMs: v.ttl,
    fresh: (now - v.ts) < v.ttl,
    sizeApprox: estimateSize(v.data),
  })).sort((a, b) => a.key.localeCompare(b.key));
}

function estimateSize(o) {
  try { return JSON.stringify(o).length; } catch { return -1; }
}
