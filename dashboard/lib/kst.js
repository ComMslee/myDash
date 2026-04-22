// KST(UTC+9) 변환/포맷 공통 유틸
// — 여러 페이지/컴포넌트에서 `+ 9 * 60 * 60 * 1000` 같은 매직 넘버를 중복하지 않도록 단일 소스 유지
// — 주의: toKstDate()로 얻은 Date의 UTC-getter(getUTCHours 등)가 KST 값을 반환한다. getHours()는 사용 금지.

export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * UTC Date(또는 ISO 문자열/ms) → KST만큼 시프트된 Date.
 * 결과 Date의 UTC-getter가 KST의 해당 값을 반환한다.
 */
export function toKstDate(input) {
  const d = input instanceof Date ? input : new Date(input);
  return new Date(d.getTime() + KST_OFFSET_MS);
}

/** KST 기준 'YYYY-MM-DD' 문자열 반환. offsetDays로 앞/뒤 날짜 이동 가능. */
export function kstDateStr(input, offsetDays = 0) {
  const base = input instanceof Date ? input.getTime() : new Date(input).getTime();
  const kst = new Date(base + KST_OFFSET_MS + offsetDays * 24 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** KST 기준 'HH:MM' 문자열 반환 */
export function formatHM(input) {
  const kst = toKstDate(input);
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mm = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** 'M/D HH:MM~HH:MM' — start~end 범위를 KST로 포맷. end 없으면 'M/D HH:MM' */
export function formatTimeRange(start, end) {
  if (!start) return '—';
  const s = toKstDate(start);
  const mm = s.getUTCMonth() + 1;
  const dd = s.getUTCDate();
  if (!end) return `${mm}/${dd} ${formatHM(start)}`;
  return `${mm}/${dd} ${formatHM(start)}~${formatHM(end)}`;
}

/**
 * UTC ms 범위를 KST 자정 기준으로 분할.
 * 각 세그먼트: { startMs, endMs, kstDay: 'YYYY-MM-DD' }
 */
export function* splitByKstMidnight(startMs, endMs) {
  if (endMs <= startMs) return;
  let cursor = startMs;
  while (cursor < endMs) {
    const kstCursor = new Date(cursor + KST_OFFSET_MS);
    // 다음 KST 자정의 UTC ms
    const nextKstMidnight = Date.UTC(
      kstCursor.getUTCFullYear(),
      kstCursor.getUTCMonth(),
      kstCursor.getUTCDate() + 1
    ) - KST_OFFSET_MS;
    const segEnd = Math.min(endMs, nextKstMidnight);
    const kstDay = `${kstCursor.getUTCFullYear()}-${String(kstCursor.getUTCMonth() + 1).padStart(2, '0')}-${String(kstCursor.getUTCDate()).padStart(2, '0')}`;
    yield { startMs: cursor, endMs: segEnd, kstDay };
    cursor = segEnd;
  }
}
