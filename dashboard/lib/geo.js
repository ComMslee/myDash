/**
 * 두 좌표 간 거리(meters). 객체 시그니처로 통일.
 * scripts/find-nearby-chargers.js 는 standalone CLI (path alias 미지원) 라 별도 사본 유지 — 의도된 중복.
 */
export function haversineMeters({ lat: la1, lng: lo1 }, { lat: la2, lng: lo2 }) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(la2 - la1);
  const dLng = toRad(lo2 - lo1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
