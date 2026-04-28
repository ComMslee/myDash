// 공조(sky-400, 알파 0.5) / 센트리 의심(fuchsia-400, 알파 0.5)
export const CLIMATE_BG = 'rgba(56,189,248,0.5)';
export const SENTRY_BG = 'rgba(232,121,249,0.5)';

// 대기 손실 3단계 텍스트 색 — 신호등(에메랄드·앰버·레드)
export function dropTextClass(drop) {
  if (drop < 0.05) return 'text-emerald-400';
  if (drop < 1.5) return 'text-emerald-700';
  if (drop < 3)   return 'text-amber-500';
  return 'text-red-500';
}

// 24h 타임라인 바 배경 (0.85 알파) — 3단계
export function dropBarBg(drop) {
  if (drop < 1.5) return 'rgba(4,120,87,0.85)';    // emerald-700
  if (drop < 3)   return 'rgba(245,158,11,0.85)';  // amber-500
  return 'rgba(239,68,68,0.85)';                    // red-500
}
