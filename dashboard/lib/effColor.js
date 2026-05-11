// Wh/km 효율 값에 따른 색상 매핑
//  < 220 Wh/km : 우수 (emerald)
//  220~259     : 보통 (yellow)
//  >= 260      : 나쁨 (orange)
//  null        : 무색 (zinc)
export function effColor(wh) {
  if (wh == null) return '#3f3f46';
  if (wh < 220) return '#10b981';
  if (wh < 260) return '#f59e0b';
  return '#f97316';
}
