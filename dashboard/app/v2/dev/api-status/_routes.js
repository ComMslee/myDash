// API 라우트 메타 — page.js 에서 import.
// dashboard: 펼침 시 raw peek 위에 추가로 보여줄 대시보드 ('server' | 'charging' | 'poll')
// params[].sample 의 'auto:firstDriveId' 는 마운트 시 /api/drives 응답에서 자동 픽.
// /api/server-status 는 ROUTES 에서 제외 — '서버' 탭이 동일 엔드포인트를 30초 자동 갱신해 그림.

// server-cache TTL 우회 (?refresh=1) 가 필요한 라우트가 공유하는 파라미터 정의.
export const REFRESH_PARAM = Object.freeze({ key: 'refresh', sample: '' });

export const CATEGORIES = ['차량', '주행', '배터리', '집충전기', '가족', '자동화'];

export const ROUTES = [
  // 차량
  { path: '/api/car',              label: '차량',           desc: '현재 상태(주차/주행/충전) + SOC·범위·위치 + 추천 충전일', category: '차량' },
  { path: '/api/drives',           label: '주행 요약',      desc: '최근 주행 목록 + 거리/시간/효율 (from·to 로 기간 필터)', category: '차량',
    params: [
      { key: 'from', sample: '' },
      { key: 'to',   sample: '' },
    ] },
  { path: '/api/insights',         label: '인사이트',       desc: '누적 거리·kWh·평균효율·요약 통계 (cache 600s · dash_monthly_insights 위임)', category: '차량',
    params: [REFRESH_PARAM] },
  { path: '/api/summary',          label: '일자 요약',      desc: 'drives+charges 집계 + 전비(eff_wh_km). range=today|yesterday|week|this-week|last-week|month|last-month|multi — 봇 /period (cache 120s · historical 범위는 dash_daily_*_agg 위임)', category: '차량',
    params: [
      { key: 'range', sample: 'multi' },
      REFRESH_PARAM,
    ] },
  { path: '/api/home-charger/groups', label: '충전기 그룹',  desc: '동별 그룹 카운트 (구성 = constants.js) — 봇 /chargers', category: '집충전기' },
  { path: '/api/home-charger/report', label: '활용도 리포트', desc: '월별 점유율·시간대×요일 히트맵·KPI — /v2/chargers/report 페이지', category: '집충전기',
    dashboard: 'report' },
  { path: '/api/parked',           label: '주차 정보',      desc: '마지막 종료 drive 위치·경과 (driving=true 면 진행 중) — 봇 /where 의 정차/주행 분기에 사용', category: '차량' },
  { path: '/api/location',         label: '현재 좌표',      desc: '최신 positions 의 lat/lng/date — 봇 /where 공용', category: '차량' },

  // 주행
  { path: '/api/route-map',        label: '경로 지도',      desc: '단일 주행의 polyline + start/end + 통계 (driveId 필수)', category: '주행',
    params: [
      { key: 'driveId', required: true, sample: 'auto:firstDriveId' },
      { key: 'detail',  sample: '' },
    ] },
  { path: '/api/heatmap',          label: '히트맵',         desc: '전체 위치 좌표 다운샘플링 → 빈도 히트맵 입력 (cache 300s)', category: '주행' },
  { path: '/api/monthly-history',  label: '월간 이력',      desc: '월별 주행거리/충전량/효율 집계 (cache 300s · dash_monthly_insights 위임)', category: '주행',
    params: [REFRESH_PARAM] },
  { path: '/api/frequent-places',  label: '자주 가는 곳',   desc: '지오펜스 도착 빈도 + 카카오 reverse geocode (집/회사 우선 핀) (cache 300s · dash_place_clusters 위임)', category: '주행',
    params: [REFRESH_PARAM] },
  { path: '/api/resolve-address',  label: '좌표→주소',      desc: 'lat/lng → 한국어 라벨 (Kakao 역지오코딩, DB 캐시) — 봇 알림 주소 폴백', category: '주행',
    params: [
      { key: 'lat', required: true, sample: '37.5665' },
      { key: 'lng', required: true, sample: '126.9780' },
    ] },
  { path: '/api/long-stay-places', label: '오래 머문 곳',   desc: '체류 시간(다음 주행 시작-종료 갭) 누적 — 10분 미만 노이즈 필터 (cache 300s)', category: '주행' },
  { path: '/api/rankings',         label: '랭킹',           desc: '주행/일자별 TOP N (type=거리·시간·평속·효율) (cache 300s/type·limit · dash_top_drives_cache 위임)', category: '주행',
    params: [
      { key: 'type',  sample: 'drive_distance' },
      { key: 'limit', sample: '30' },
      REFRESH_PARAM,
    ] },

  // 배터리
  { path: '/api/battery',          label: '배터리',         desc: 'SOC 종합 — 용량·체류 분포·주간/월간 충방전·추정 잔여 (cache 180s)', category: '배터리',
    params: [REFRESH_PARAM] },
  { path: '/api/range-radius',     label: '잔여 거리 반경',  desc: '현 위치 + 예상 주행거리(est_km, rated 폴백) × 0.75 → 편도/왕복 반경 (cache 60s) — /v2/battery 상단 지도', category: '배터리' },
  { path: '/api/battery-trend',    label: '배터리 추이',    desc: 'SOC 시계열 (라인 차트용 다운샘플링) (cache 600s)', category: '배터리',
    params: [REFRESH_PARAM] },
  { path: '/api/charges',          label: '충전 기록',      desc: '최근 충전 세션 목록 (시작 SOC → 종료 SOC, kWh, 위치)', category: '배터리' },
  { path: '/api/charge-all-time',  label: '충전 전기간',    desc: '전기간 누적 충전 통계 (총 kWh, 횟수, 평균) (cache 600s · dash_daily_charge_agg 단독)', category: '배터리',
    params: [REFRESH_PARAM] },
  { path: '/api/charging-status',  label: '충전 상태',      desc: '현재 충전 중 여부 + power/level 신호 + 폴백 진단', category: '배터리', dashboard: 'charging' },
  { path: '/api/fast-charges',     label: '급속 기록',      desc: 'DC 급속(>50kW) 충전 세션 필터 (cache 180s)', category: '배터리' },
  { path: '/api/slow-charges',     label: '완속 기록',      desc: 'AC 완속 충전 세션 필터 (cache 180s)', category: '배터리' },
  { path: '/api/debug/charging',   label: '디버그 · 충전',  desc: '충전 감지 raw 신호 (positions.power, charges 행, states)', category: '배터리' },

  // 집충전기
  { path: '/api/home-charger',                  label: '집충전기',         desc: '환경공단 API 사용량 (캐시 우선, refresh=1로 강제 갱신)', category: '집충전기',
    params: [REFRESH_PARAM] },
  { path: '/api/home-charger/fleet-stats',      label: '집충전기 누적',    desc: '등록된 모든 집충전기 월별 누적 (months 로 기간)', category: '집충전기',
    params: [{ key: 'months', sample: '' }] },
  { path: '/api/home-charger/poll-log',         label: '집충전기 로그',    desc: '폴링 루프 로그 + warm 진단 (view=hourly/daily/raw)', category: '집충전기', dashboard: 'poll',
    params: [
      { key: 'view', sample: 'hourly' },
      { key: 'days', sample: '' },
      { key: 'date', sample: '' },
    ] },
  { path: '/api/find-nearby-chargers',          label: '주변 충전소',      desc: '좌표/주소 기반 주변 충전소 탐색 (1회성 조사)', category: '집충전기',
    params: [
      { key: 'radius', sample: '' },
      { key: 'count',  sample: '' },
      { key: 'addr',   sample: '' },
      { key: 'name',   sample: '' },
    ] },

  // 가족
  { path: '/api/family/festivals', label: '축제',           desc: '한국관광공사 TourAPI(searchFestival2) 래핑 — 봇 /festivals (가족)', category: '가족',
    params: [
      { key: 'from',     sample: '' },
      { key: 'to',       sample: '' },
      { key: 'areaCode', sample: '' },
      { key: 'size',     sample: '' },
    ] },
  { path: '/api/holidays',         label: '공휴일',         desc: 'KASI 특일정보 lazy 캐시 (dash_holidays · 30일 TTL) — 이력 리스트 일자 색상', category: '가족',
    params: [
      { key: 'year', sample: '' },
      REFRESH_PARAM,
    ] },

  // 자동화 (Tesla 스케줄러 + 외부 API connectivity 테스트)
  { path: '/api/weather/test',         label: '기상청 테스트',     desc: 'KMA 단기예보 connectivity — apiKeyMissing/캐시상태 노출 (기본 서울시청 좌표). cached=true 면 1시간 캐시 hit.', category: '자동화',
    params: [
      { key: 'lat', sample: '37.5665' },
      { key: 'lng', sample: '126.9780' },
    ] },
  { path: '/api/tesla-test/ping',      label: '테슬라 테스트',     desc: 'Fleet API vehicle_data 1회 호출 ($0.002 — ENABLED=false면 실호출 0). 토큰·vehicle id 누락 명시. Mock 모드는 즉시 회신.', category: '자동화' },
  { path: '/api/schedules',            label: '스케줄 목록',       desc: '등록된 자동화 스케줄 + 활성/조건/마지막 실행', category: '자동화' },
  { path: '/api/schedules/executions', label: '스케줄 이력',       desc: '실행 이력 통합 (limit 최대 500). status: success/failed/skipped/dry_run', category: '자동화',
    params: [{ key: 'limit', sample: '50' }] },
  { path: '/api/geofences',            label: '지오펜스',          desc: '집/회사 좌표 + 반경 (위치 자동화 기준점)', category: '자동화' },
  { path: '/api/pause-periods',        label: '휴무 모드',         desc: '날짜 범위 일시정지 등록 (apply_pause_mode 스케줄만 영향)', category: '자동화' },
  { path: '/api/usage/current-month',  label: '이번 달 사용량',    desc: '$10 크레딧 진행률 + 실제/예상 비용 + 카테고리별 호출 수', category: '자동화' },
];
