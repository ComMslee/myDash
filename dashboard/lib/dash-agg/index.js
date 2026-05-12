// 사전 집계 (KST 기준) — TeslaMate DB 에 dash_ prefix 자체 테이블.
//
// Tier 2 풀:
//   dash_daily_drive_agg, dash_daily_charge_agg  — 일/시간 버킷, hour×dow + 일별 합산
//   dash_monthly_insights                         — 월별 insights / monthly-history
//   dash_top_drives_cache                         — rankings TOP 50/메트릭
//   dash_place_clusters / dash_place_geo          — frequent-places 끝점 0.0005° 빈도
//
// 멱등성: 각 refresh* 는 안전하게 재실행 가능 (DELETE+INSERT 또는 UPSERT). cron 실패 self-heal.
// 스키마: docs/PRECOMPUTE_PLAN.md Tier 2 참조.

export { ensureSchema } from './schema';
export { bootstrapIfEmpty } from './bootstrap';
export { refreshRange, readHourDow } from './daily';
export { refreshMonthlyInsights } from './monthly';
export { refreshTopDrivesCache } from './top';
export { refreshPlaceClusters } from './places';
