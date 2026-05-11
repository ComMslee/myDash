// 전 앱 공용 outline-stroke 아이콘 — OS 별 이모지 렌더 편차 제거, 다크 톤 일관성.
// 색: currentColor 상속. 크기: className (기본 w-3 h-3).
// 신규 추가 시 path 만 추가하면 됨 — 모든 소비자 컴포넌트가 자동 일관성 확보.

export const ICON_PATHS = {
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  car: 'M4 12l2-5h12l2 5v4H4v-4zM7 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  road: 'M5 3v18M19 3v18M12 7v2m0 4v2m0 4v2',
  park: 'M8 4v16M8 4h5a4 4 0 0 1 0 8H8',
  calendar: 'M8 7V3m8 4V3M3 11h18M5 7h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z',
  pin: 'M12 21s-7-6-7-12a7 7 0 1 1 14 0c0 6-7 12-7 12zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  clock: 'M12 8v4l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z',
  bolt: 'M13 2L3 14h7l-1 8 10-12h-7l1-8z',
  shield: 'M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z',
  climate: 'M12 3v18M3 12h18M5.6 5.6l12.8 12.8M5.6 18.4L18.4 5.6',
  mountain: 'M3 20l5-9 4 5 3-4 6 8H3z',
  thermometer: 'M14 14V4a2 2 0 1 0-4 0v10a4 4 0 1 0 4 0z',
  fire: 'M12 22c-4 0-7-3-7-7 0-3 2-5 3-7 1 2 2 3 4 3 0-4-2-6-2-9 5 1 9 6 9 13 0 4-3 7-7 7z',
  sleep: 'M5 8h6L5 16h6M14 5h5l-5 6h5',
  bulb: 'M9 21h6m-5-3h4M12 3a6 6 0 0 0-4 10.5c.7.8 1 1.7 1 2.5h6c0-.8.3-1.7 1-2.5A6 6 0 0 0 12 3z',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM21 21l-4.35-4.35',
  warn: 'M12 9v4m0 4h.01M12 3l10 17H2L12 3z',
  x: 'M6 6l12 12M18 6l-12 12',
  check: 'M5 12l5 5L20 7',
  pencil: 'M4 20l4-1 11-11-3-3L5 16l-1 4z',
  medal: 'M12 16a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8 13l-3 7 4-2 3 2 3-2 4 2-3-7',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
};

export function Icon({ name, className = 'w-5 h-5 flex-shrink-0', filled = false }) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    </svg>
  );
}
