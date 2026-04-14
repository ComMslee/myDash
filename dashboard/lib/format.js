// 공유 포맷 유틸 — 여러 페이지에서 동일한 함수를 중복 정의하지 않도록 단일 소스 유지

/** 분 → "X시간 Y분" 또는 "Y분" */
export function formatDuration(minutes) {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h === 0 ? `${m}분` : `${h}시간 ${m}분`;
}

/** ISO 날짜 문자열 → "M월 D일 HH:MM" */
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** 주소 문자열의 첫 번째 컴포넌트만 반환 */
export function shortAddr(addr) {
  if (!addr) return null;
  return addr.split(',')[0]?.trim() || addr;
}
