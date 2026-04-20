// 공유 포맷 유틸 — 여러 페이지에서 동일한 함수를 중복 정의하지 않도록 단일 소스 유지

/** 분 → "X시간 Y분" 또는 "Y분" */
export function formatDuration(minutes) {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h === 0 ? `${m}분` : `${h}시간 ${m}분`;
}

/** 시간(소수 가능) → "X시간 Y분" 또는 "Y분" (1시간 미만은 분 단위) */
export function formatHours(hours) {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}분`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
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

/** ISO 날짜 문자열 → 연도가 현재와 다르면 "YY/MM/DD", 같으면 "MM/DD" */
export function formatKorDate(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).split('T')[0].split('-');
  const year = parseInt(parts[0]);
  const mm = String(parseInt(parts[1])).padStart(2, '0');
  const dd = String(parseInt(parts[2])).padStart(2, '0');
  const currentYear = new Date().getFullYear();
  return year !== currentYear ? `${String(year).slice(2)}/${mm}/${dd}` : `${mm}/${dd}`;
}

/** ISO 날짜 + 시간 → "YY/M/D HH:MM" */
export function formatKorDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const y = String(d.getFullYear()).slice(2);
  const m = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}/${m}/${dd} ${hh}:${mm}`;
}

/** "YYYY-MM-DD" → "YY/M/D" (day API 응답용) */
export function formatKorDay(day) {
  if (!day) return '—';
  const [y, m, d] = String(day).split('-');
  return `${y.slice(2)}/${parseInt(m)}/${parseInt(d)}`;
}
