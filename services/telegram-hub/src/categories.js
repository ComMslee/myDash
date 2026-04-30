// 카테고리(=feature) 카탈로그.
// 새 카테고리 추가 시 여기에 한 줄 + commands.js 의 핸들러에 feature 태그.
export const CATEGORIES = [
  { key: 'car', label: '🚗 차',  desc: '내 테슬라 상태/위치/충전' },
  // 미래 예시:
  // { key: 'sns',     label: '💬 SNS',   desc: '소셜 발행/예약' },
  // { key: 'finance', label: '💰 가계',  desc: '지출/예산 알림' },
  // { key: 'photo',   label: '📷 사진',  desc: '업로드/정리' },
];

export function categoryByKey(key) {
  return CATEGORIES.find((c) => c.key === key) || null;
}

export function labelOf(key) {
  return categoryByKey(key)?.label || key;
}
