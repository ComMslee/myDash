// family/SNS 등 외부 채널로 흘러가는 응답의 좌표 정밀도 축소.
// 소수점 3자리 ≈ ±100m — 동네/장소 식별은 가능, 집·직장 핀포인트는 불가.
// 대시보드 UI(`/api/location`, `/api/route-map`) 는 본인 사용 → 정확 좌표 유지.

export function roundCoord(n, decimals = 3) {
  if (n == null || n === '') return null;
  const x = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(x)) return null;
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}
