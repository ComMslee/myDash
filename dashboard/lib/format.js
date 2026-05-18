// 공유 포맷 유틸 — 여러 페이지에서 동일한 함수를 중복 정의하지 않도록 단일 소스 유지

/** 분 → "Xh Ym" 또는 "Ym" (h/m 단축 표기 — 전체 통일) */
export function formatDuration(minutes) {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h === 0 ? `${m}m` : `${h}h ${m}m`;
}

/** formatDuration 의 별칭 — 기존 코드 호환 */
export const formatHm = formatDuration;

/** 초 → "초/분/h시간/일/주" 자동 스케일. 체류시간(dwell) 표기용. formatDuration 은 분 단위라 별도. */
export function formatDwellSec(sec) {
  if (sec == null) return '—';
  if (sec < 60) return `${Math.floor(sec)}초`;
  if (sec < 3600) return `${Math.floor(sec / 60)}분`;
  if (sec < 86400) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return m === 0 ? `${h}시간` : `${h}h${m}m`;
  }
  if (sec < 7 * 86400) {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    return h === 0 ? `${d}일` : `${d}일 ${h}h`;
  }
  const w = Math.floor(sec / (7 * 86400));
  const d = Math.floor((sec % (7 * 86400)) / 86400);
  return d === 0 ? `${w}주` : `${w}주 ${d}일`;
}

/** 시간(소수 가능) → "Xh Ym" 또는 "Ym" (1시간 미만은 분 단위) */
export function formatHours(hours) {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
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

/** ms → "Xms" 또는 "X.Ys" */
export function formatMs(n) {
  if (n == null) return '—';
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(2)}s`;
}

/** bytes → "XB" / "X.YK" / "X.YM" */
export function formatBytes(n) {
  if (n == null || n < 0) return '—';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}K`;
  return `${(n / 1024 / 1024).toFixed(1)}M`;
}

/**
 * ISO 시각 → "N초/분/시간/일 전" (한국어 상대시간).
 * opts:
 *   futureLabel — 미래 시각에 표시할 라벨 (기본 '방금', 진단용 '미래?')
 *   hourUnit   — 시간 단위 표기 (기본 '시간', 컴팩트 'h')
 *   nullLabel  — null/undefined 입력 시 라벨 (기본 '—', 빈 표시 '')
 */
export function formatRelativeTime(iso, opts = {}) {
  const { futureLabel = '방금', hourUnit = '시간', nullLabel = '—' } = opts;
  if (!iso) return nullLabel;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return nullLabel;
  const ageMs = Date.now() - t;
  if (ageMs < 0) return futureLabel;
  if (ageMs < 60_000) return `${Math.floor(ageMs / 1000)}초 전`;
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}분 전`;
  if (ageMs < 86_400_000) return `${Math.floor(ageMs / 3_600_000)}${hourUnit} 전`;
  return `${Math.floor(ageMs / 86_400_000)}일 전`;
}
