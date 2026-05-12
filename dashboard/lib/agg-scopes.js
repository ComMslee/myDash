// 사전집계 갱신 scope — 클라이언트(/v2/dev/api-status 집계 탭) 와 서버
// (/api/admin/refresh-aggs, /api/admin/agg-status) 가 공유하는 단일 소스.
//
// 새 scope 추가 시:
//   1. 여기에 AGG_SCOPES 항목 추가
//   2. /api/admin/refresh-aggs 의 분기에 추가
//   3. dash-agg 의 해당 refresh* 함수 작성

export const AGG_SCOPES = Object.freeze([
  Object.freeze({ key: 'all',     label: '전체',  hint: '4 테이블 모두' }),
  Object.freeze({ key: 'daily',   label: '일별',  hint: 'dash_daily_*' }),
  Object.freeze({ key: 'monthly', label: '월별',  hint: 'dash_monthly_insights' }),
  Object.freeze({ key: 'top',     label: 'TOP',   hint: 'dash_top_drives_cache' }),
  Object.freeze({ key: 'places',  label: '장소',  hint: 'dash_place_clusters' }),
]);

export const AGG_SCOPE_KEYS = Object.freeze(AGG_SCOPES.map(s => s.key));
