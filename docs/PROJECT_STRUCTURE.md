# 프로젝트 구조

```
myDash/
├── CLAUDE.md                   # Claude 에이전트 지침 (요약)
├── docker-compose.yml          # teslamate + teslamate-auth(Caddy) + database + mosquitto + dashboard
├── docker-compose.tailscale.yml
├── Caddyfile                   # teslamate-auth (4000번) — dashboard PIN forward_auth → teslamate
├── .github/workflows/deploy.yml
├── docs/                       # 상세 문서
├── services/
│   └── telegram-hub/           # 텔레그램 봇 게이트웨이 (dashboard API 만 호출 원칙. hub 자체 데이터 + 변동 감지 폴링 한정 DB 직접 접근)
│       └── src/
│           ├── index.js        # 부트스트랩 — startHttpServer + startDbPoller + startTelegramPoller
│           ├── tg_poller.js    # 텔레그램 long-poll 루프 → handleMessage/handleCallback 호출
│           ├── poller.js       # TeslaMate charging_processes/drives 5초 폴링 → 변동 감지 알림 트리거
│           ├── notify.js       # HTTP 서버 — 외부 알림 push 수신 + getState 기반 라우팅
│           ├── state.js        # loadState/getState/setState — 알림 상태 영속화
│           ├── commands.js     # COMMANDS 카탈로그 + handleMessage/handleCallback/syncUserMenu + 메뉴 빌더(buildMainKeyboard/buildSubKeyboard) + cmdHelp/cmdCategories/cmdWhoami
│           ├── formatters.js   # 명령 포맷 헬퍼 (fmtElapsed/fmtSecHm/ymdKstNow/weekendRangeKst/fmtYmdShort/fmtFestivalDates)
│           ├── format.js       # 폴러용 포맷 헬퍼 (formatKst/formatDur)
│           ├── handlers/
│           │   ├── car.js      # 차량 명령 (/soc /where /period /chargers /places) + FOLLOWUP/followUp
│           │   ├── family.js   # 가족·축제 (/weather /forecast /event /memo /festivals /setarea)
│           │   ├── sns.js      # SNS 발행 (/post + handleSnsCallback + 키보드 빌더)
│           │   └── admin.js    # 운영 명령 (/pending /setgroup /deny) — syncUserMenu/cmdHelp 는 commands.js 에서 주입(순환 import 방지)
│           ├── auth.js         # hub_auth_users RBAC + ensureAuthSchema
│           ├── user_groups.js  # hub_user_groups — 카테고리 가시성 그룹 매핑
│           ├── pending.js      # in-memory 다단계 입력 상태(action+data+expiresAt)
│           ├── categories.js   # 카테고리 메타(라벨/설명/feature 키)
│           ├── telegram.js     # Telegram Bot API 래퍼 (sendMessage/setMyCommands 등)
│           ├── dash.js         # dashGet/dashPost — dashboard /api/* 호출 wrapper
│           └── db.js           # PostgreSQL 커넥션 풀 (TeslaMate 폴링 + hub 자체 테이블)
└── dashboard/
    ├── Dockerfile
    ├── package.json
    ├── next.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── jsconfig.json             # @/ → dashboard/ 경로 별칭
    ├── instrumentation.js        # Next.js 기동 훅 (edge/node 라우팅)
    ├── instrumentation-node.js   # Node 런타임 — 집충전기 캐시 warm-up(2분 keep-warm)
    ├── scripts/
    │   ├── find-nearby-chargers.js  # 좌표 기반 근처 충전소 조회 유틸
    │   └── search-by-name.js        # 충전소 이름 검색 유틸
    ├── lib/
    │   ├── db.js                 # PostgreSQL 커넥션 풀 (싱글턴)
    │   ├── server-cache.js       # 모듈 스코프 Map + per-key TTL + inflight dedup — `withCache(key, ttlMs, fn)` / `invalidate(prefix)` / `cacheStats()`
    │   ├── cache-ttls.js         # TTL 상수 단일 소스 — `TTL_120S` / `TTL_180S` / `TTL_300S` / `TTL_600S` (12 라우트 공유)
    │   ├── internal-urls.js      # 내부 서비스 URL — `TG_HUB_URL` (telegram-hub 도커 네트워크)
    │   ├── agg-scopes.js         # 사전집계 scope 메타(`AGG_SCOPES`, `AGG_SCOPE_KEYS`) — refresh-aggs 라우트 + 집계 탭 카드가 공유
    │   ├── dash-agg/             # 사전 집계 6 테이블 — barrel(index.js) 통해 `@/lib/dash-agg` 단일 import
    │   │   ├── index.js          # 공개 API barrel re-exports
    │   │   ├── schema.js         # ensureSchema (idempotent tableReady 플래그)
    │   │   ├── bootstrap.js      # bootstrapIfEmpty — 컨테이너 라이프타임당 1회 풀 백필 (4 empty 체크 병렬)
    │   │   ├── daily.js          # refreshRange + readHourDow (dash_daily_*_agg)
    │   │   ├── monthly.js        # refreshMonthlyInsights (21 컬럼 + best long/eff drive)
    │   │   ├── top.js            # refreshTopDrivesCache (8 메트릭 × TOP 50 truncate-replace)
    │   │   ├── places.js         # refreshPlaceClusters (0.0005° bin + top origin)
    │   │   └── _txn.js           # withTxn(fn) — BEGIN/COMMIT/ROLLBACK/release 보일러플레이트 헬퍼
    │   ├── constants.js          # KWH_PER_KM, RATED_RANGE_MAX_KM
    │   ├── format.js             # formatDuration, formatHm, formatHours, formatDate, shortAddr, formatKorDate, formatKorDateTime, formatKorDay
    │   ├── kst.js                # KST(UTC+9) 시간 변환 헬퍼
    │   ├── effColor.js           # 효율 색상 매핑
    │   ├── geo.js                # 좌표/거리 헬퍼 (Haversine 등)
    │   ├── kakao-geo.js          # Kakao Local 역지오코딩 (DB 캐시 우선)
    │   ├── home-charger-cache.js # 환경공단 API 캐시 + 정적 5~12분 / 동적 4~15분 + DB 스냅샷 영속화 + 시간당 사용 카운트
    │   ├── auth-helper.js        # PIN 검증·세션 쿠키 헬퍼 (로그인/forward_auth)
    │   ├── auth-store.js         # PIN 해시 저장/검증 (단일 사용자 가정)
    │   ├── tg-user-groups.js     # 텔레그램 사용자→카테고리 그룹 매핑 (대시보드 측 캐시·조회)
    │   ├── docker-stats.js       # docker.sock CPU/메모리 통계 — server-status 용
    │   ├── drive-classify.js     # 주행 분류 헬퍼 (장거리/통근/단거리 등)
    │   ├── schedule-evaluator.js     # Tesla 자동화 트리거 판정 — 시간/장소/날씨 3축 + 휴무·skip_dates 분기
    │   ├── schedule-runner.js        # 1분 setInterval 워커 — listSchedules → evaluate → run + 결과 로깅 (TESLA_FLEET_API_ENABLED 게이팅)
    │   ├── queries/              # 도메인별 SQL 쿼리 모듈
    │   │   ├── battery-capacity.js
    │   │   ├── battery-health.js
    │   │   ├── battery-idle.js
    │   │   ├── battery-records.js
    │   │   ├── car.js                  # getDefaultCar() — 단일 차량 조회 헬퍼 (10+ 라우트 공유)
    │   │   ├── family-festivals.js     # family_festivals 테이블 스키마/CRUD — GHA cron 폴링 결과 저장
    │   │   └── schedules.js            # 자동화 스키마(6테이블) + 스케줄 CRUD + 실행 로그 + 월별 사용량 누적/단가 + 휴무 + 지오펜스(TeslaMate read-only)
    │   └── home-charger/         # 집충전기 서버사이드 로직
    │       ├── fleet-stats.js    # 단지 통계 집계
    │       ├── poll-log.js       # 폴링 로그 조회
    │       ├── schema.js         # DB 스키마 정의
    │       └── usage.js          # 사용량 계산
    ├── app/
    │   ├── layout.js             # 루트 레이아웃 (MockProvider) — 전역 헤더 없음, 하단 알약(BottomNavV2)으로 상태/네비 통합
    │   ├── globals.css           # Tailwind 지시어 + Leaflet 다크 테마 오버라이드
    │   ├── page.js               # `/` → `/v2` 리다이렉트
    │   ├── login/page.js         # PIN 로그인 페이지 (`/login?next=...`) — Caddy forward_auth 미인증 리다이렉트 진입점
    │   ├── setup/page.js         # 초기 PIN 설정 페이지 (`/setup`) — auth-store 비어있을 때만 노출
    │   ├── context/
    │   │   └── mock.js           # MockProvider + MOCK_DATA (개발용 가상 데이터)
    │   ├── lib/
    │   │   └── useScrollShrink.js  # 스크롤 임계점 기반 축소 토글 훅 (BottomNavV2 전용 — 60px down→축소 / 30px up→펼침 히스테리시스)
    │   ├── components/           # 공용 컴포넌트 (v1·v2 공유)
    │   │   ├── PageLayout.js     # Spinner 공유 컴포넌트
    │   │   ├── ChartWidgets.js   # HourDowHeatmap — 시간×요일 progress-bar (셀별 막대 fill, 피크 amber)
    │   │   ├── DriveMap.js       # Leaflet 주행 경로 지도 — positions(단일) / routes(다중, 일 합계) / highlightLatLng(포인트) / highlightRouteId(다중 모드 한 구간 강조 + zoom)
    │   │   └── RouteSparklines.js # 속도/고도/온도 3행 스파크라인 + 포인터 스크럽 선택
    │   ├── v2/                   # v2 앱 (현재 메인)
    │   │   ├── layout.js         # v2 레이아웃 (BottomNavV2 포함)
    │   │   ├── page.js           # `/v2` → `/v2/drives` 리다이렉트
    │   │   ├── components/
    │   │   │   ├── BottomNavV2.js    # 하단 알약(BottomNav + 헤더 흡수) — 좌측 ⚙️ | 4탭(주행/이력/배터리/충전소) · SOC fill 배경(충전=노랑/그 외=초록) · 정보 행(상태 chip + 온라인 dot + 경과/충전 상세/예측 km·%) · ⚙️ 시트(텔레그램/API상태/인증) · /api/car + /api/charging-status 30초 폴링 · 스크롤 시 축소(useScrollShrink)
    │   │   │   └── RankingsSheet.js  # 랭킹 바텀시트
    │   │   ├── drives/
    │   │   │   ├── page.js                   # 주행 분석 — 차량 KPI + 인사이트 + 시간×요일 패턴 + TOP50 + 연도별 월간
    │   │   │   └── _parts/
    │   │   │       ├── VehicleKpiCard.js     # 차량 누적·효율·주행 KPI (전기간 인라인)
    │   │   │       ├── MonthInsightsCard.js  # 이번달 인사이트 (4주 롤링)
    │   │   │       ├── RecordsCardV2.js      # TOP 50 기록 + 랭킹 시트
    │   │   │       ├── MonthlyHistoryByYear.js # 연도별 월간 통계 막대
    │   │   │       └── SeasonalEffGrid.js    # 계절별 효율 그리드
    │   │   ├── battery/
    │   │   │   ├── page.js                   # 배터리 — 건강/대기 소모/충전 습관/월간(시간×요일 그래프)/급속·완속
    │   │   │   ├── HealthScoreCard.js        # 점수(등급)·평균 SOC·용량 추이 + SOC 체류 분포
    │   │   │   ├── IdleDrainCard.js          # 대기 소모 24h 타임라인
    │   │   │   ├── useIdleDrainDays.js       # 대기 소모 일자별 데이터 훅
    │   │   │   ├── idle-drain/               # 대기 소모 카드 내부 모듈
    │   │   │   │   ├── DayTimeline.js
    │   │   │   │   ├── WeekHeader.js
    │   │   │   │   ├── colors.js
    │   │   │   │   └── compute.js
    │   │   │   ├── HomeChargerCard.js        # 집충전기 실시간 상태 (환경공단 API) — `/v2/chargers` 에서 사용
    │   │   │   ├── home-charger/             # 집충전기 카드 내부 모듈
    │   │   │   │   ├── constants.js          # ID 매핑, 동 배치, 상태 메타, 주기 상수
    │   │   │   │   ├── utils.js              # computeRanks, elapsedLabel, buildTtlTooltip 등
    │   │   │   │   ├── ChargerTile.js        # UnifiedCell, TileBox, StatusBadges, MiniGrid
    │   │   │   │   ├── FleetStatsCharts.js   # 집단 통계 차트
    │   │   │   │   ├── PollLogPopup.js       # 폴링 로그 팝업
    │   │   │   │   └── fleet-stats-utils.js  # 통계 집계 유틸
    │   │   │   ├── MonthlyChargeCard.js      # 집/외부·완/급속 비율 + 시간×요일 progress-bar (충전 활성 구간 모든 시간 슬롯 +1)
    │   │   │   ├── FastChargeCard.js
    │   │   │   └── SlowChargeCard.js
    │   │   ├── history/
    │   │   │   ├── page.js           # 이력 페이지 — 리스트(일 카드) / dayMode(지도 + 컴팩트 strip 하이라이트) / monthMode(월 합계) / 단일 주행. 자주 가는 곳·오래 머문 곳 placesMode 탭 토글 포함
    │   │   │   ├── DriveListView.js  # 월 그룹 → 일 카드 (24h 막대 + 🚗/🛣️/🅿️ 메타라인). 일 카드 탭 = onDayClick(dateStr)
    │   │   │   └── useDriveData.js   # drives + dayRoutes/monthRoutes 병렬 fetch (CLAUDE.md DriveMap 함정 5개 상주)
    │   │   ├── chargers/
    │   │   │   ├── page.js               # 집충전기 실시간 + Top 순위 + 활용도 리포트 인라인
    │   │   │   ├── _parts/ReportPanel.js # 활용도 라이브 리포트 컴포넌트 (KPI · 주별 추이 · 동별)
    │   │   │   └── report/page.js        # 활용도 리포트 단독 페이지 (외부 캡처/공유)
    │   │   ├── tg/page.js            # 텔레그램 봇 관리 (권한·방송·학습로그·가이드)
    │   │   ├── schedule/             # Tesla 자동화 스케줄러 — 캘린더 중심 단일 페이지
    │   │   │   ├── page.js           # 메인 — UsageCard + Calendar(세로 타임라인) + PausePanel + ScheduleList + ExecutionLog. ⚙ 시트는 즉시실행/지오펜스/실연동체크만
    │   │   │   ├── Calendar.js       # 세로 타임라인 ±14일 (📅 더보기로 범위 확장) + HotBar(다음/마지막 실행) + DayRow(plan/exec chip + skip 토글)
    │   │   │   ├── UsageCard.js      # 이번달 Tesla Fleet API 사용량 — 실제 + 예상 + 진행바 + Commands/Wakes/Data/Signals 카운트
    │   │   │   ├── ScheduleList.js   # 스케줄 카드 리스트 — 인라인 요일 토글 + skip 일자 chip + ▶/편집/삭제, 마지막에 [+ 새 스케줄]
    │   │   │   ├── ScheduleForm.js   # 신규/편집 폼 (시간·장소·날씨 3축 트리거 빌더)
    │   │   │   ├── PausePanel.js     # 휴무 모드 — 기간(from~until) 추가/삭제. 해당 기간 자동 실행 일괄 차단
    │   │   │   ├── ExecutionLog.js   # 전체 이력 — 최근 실행 결과 시계열
    │   │   │   ├── SettingsSheet.js  # ⚙ 바텀시트 — 3섹션(NowPanel/GeofencesPanel/체크리스트)
    │   │   │   ├── NowPanel.js       # 즉시 실행 — 비용 보호용 1뎁스 안쪽 (드물게 씀)
    │   │   │   └── GeofencesPanel.js # 지오펜스 read-only 표시 (CRUD 는 TeslaMate UI)
    │   │   └── dev/                  # 개발/진단 도구 (하단 알약 미노출, URL 직접)
    │   │       ├── api-status/
    │   │       │   ├── page.js       # 3탭(서버/API 테스트/집계) — 28개 라우트 가용성 체크 + 서버/충전/폴링 진단 + 사전집계 상태/scope 갱신 통합 · 서버 폴링은 '서버' 탭 활성일 때만
    │   │       │   └── _components/
    │   │       │       ├── AggStatusCard.js   # 집계 탭 — dash_* 6 테이블 진단 + AGG_SCOPES (공유) 별 refresh-aggs POST 트리거 + server-cache 메모리 상태
    │   │       │       ├── ServerStatusCard.js
    │   │       │       ├── RouteRow.js
    │   │       │       ├── RenderErrorBoundary.js
    │   │       │       └── ChargingDiagPanel.js
    │   │       └── auth/
    │   │           └── page.js       # 로그인 PIN 변경 (단일 사용자)
    │   └── api/                  # 서버사이드 API 라우트 (모두 GET, force-dynamic)
    │       ├── admin/refresh-aggs/route.js  # 사전 집계 갱신 (POST · requireAuth · scope=daily|monthly|top|places|all · bootstrap-on-empty) — 매일 04:00 KST GHA cron
    │       ├── admin/agg-status/route.js    # 사전 집계 진단 (GET · requireAuth) — dash_* 6 테이블 rows/freshness + server-cache 메모리 상태 → /v2/dev/api-status 집계 탭
    │       ├── car/route.js              # 차량 기본 정보 + 배터리 + 상태
    │       ├── charging-status/route.js  # 현재 충전 상태
    │       ├── drives/route.js           # 주행 통계(오늘/주/월) + 최근 주행 목록
    │       ├── charges/route.js          # 충전 이력 + 월간/전체 비용
    │       ├── fast-charges/route.js     # 급속 충전 기록 (server-cache 180s)
    │       ├── slow-charges/route.js     # 완속 충전 기록 (server-cache 180s)
    │       ├── insights/route.js         # 12개월 집계 + 시간대/요일 패턴 (server-cache 600s · dash_monthly_insights 위임, 현재월 라이브)
    │       ├── monthly-history/route.js  # 24개월 월별 주행/충전/효율 (server-cache 300s · dash_monthly_insights 위임)
    │       ├── battery/route.js          # 배터리 건강 + 히스토그램 + 대기 소모 (server-cache 180s)
    │       ├── battery-trend/route.js    # 배터리 용량/습관 월별 트렌드 (server-cache 600s)
    │       ├── charge-all-time/route.js  # 누적 충전 비용 (server-cache 600s · dash_daily_charge_agg 단독)
    │       ├── frequent-places/route.js  # 자주 방문 장소 랭킹 (server-cache 300s · dash_place_clusters 위임)
    │       ├── long-stay-places/route.js # 오래 머문 장소 랭킹 (drives LEAD 윈도우로 dwell 산출, ≥10분만)
    │       ├── rankings/route.js         # 랭킹 페이지 데이터 (server-cache 300s · dash_top_drives_cache 위임 + drives JOIN)
    │       ├── route-map/route.js        # 특정 주행의 GPS 경로
    │       ├── heatmap/route.js          # 히트맵 데이터
    │       ├── home-charger/route.js              # 집충전기 실시간 (환경공단 EvCharger API + 시간대별 캐시)
    │       ├── home-charger/fleet-stats/route.js  # 집충전기 단지 통계
    │       ├── home-charger/groups/route.js       # 동별 그룹 카운트 (constants.js 매핑) — 봇 /chargers
    │       ├── home-charger/report/route.js       # 활용도 리포트 (KPI·주별·동별) — /v2/chargers/report 페이지
    │       ├── home-charger/poll-log/route.js     # 폴링 로그 조회
    │       ├── summary/route.js                   # drives+charges 일자 집계 (range=multi 등) — 봇 /period (server-cache 120s · historical 범위는 dash_daily_*_agg 위임)
    │       ├── parked/route.js                    # 마지막 주차/주행중 — 봇 /where
    │       ├── location/route.js                  # 최신 좌표 — 봇 /where
    │       ├── sns/blog/route.js                  # 네이버 블로그 발행 mock (POST) — 봇 /post 채널 검증
    │       ├── family/festivals/route.js          # TourAPI 축제 캐시 — 봇 /festivals
    │       ├── family/festivals/refresh/route.js  # 축제 강제 갱신 (POST)
    │       ├── auth/verify/route.js               # forward_auth 세션 쿠키 검증 (Caddy → teslamate)
    │       ├── auth/change/route.js               # PIN 변경 (POST)
    │       ├── login/route.js                     # PIN 로그인 (POST → 쿠키)
    │       ├── logout/route.js                    # 로그아웃 (POST → 쿠키 폐기)
    │       ├── setup/route.js                     # 초기 PIN 설정 (auth-store 비어있을 때만)
    │       ├── tg/route.js                        # 텔레그램 사용자/그룹 관리 — /v2/tg 페이지
    │       ├── tg/action/route.js                 # 텔레그램 권한 변경 액션 (POST) — /v2/tg
    │       ├── resolve-address/route.js           # 좌표 → 한글 주소 (Kakao 캐시 경유)
    │       ├── find-nearby-chargers/route.js  # 좌표 기반 주변 충전소 검색
    │       ├── debug/charging/route.js        # 충전 디버그 정보
    │       ├── server-status/route.js         # 호스트(/proc/meminfo · statfs) + 컨테이너(docker.sock) + DB 로그(server_health_log) + 24h 피크/한산 — /v2/dev/api-status 4열 대시보드용
    │       ├── schedules/route.js                       # 자동화 스케줄 CRUD (GET 목록 / POST 생성)
    │       ├── schedules/[id]/route.js                  # 단건 GET / PUT / DELETE
    │       ├── schedules/[id]/run-now/route.js          # 즉시 1회 실행 — dry_run 또는 실제 (TESLA_FLEET_API_ENABLED 게이팅)
    │       ├── schedules/[id]/executions/route.js       # 해당 스케줄의 최근 실행 이력
    │       ├── schedules/executions/route.js            # 전체 실행 이력 (캘린더·이력 패널 공통 소스)
    │       ├── pause-periods/route.js                   # 휴무 모드 기간 CRUD (GET/POST)
    │       ├── pause-periods/[id]/route.js              # 휴무 기간 DELETE
    │       ├── geofences/route.js                       # 지오펜스 목록 — TeslaMate `geofences` 테이블 read-only 미러
    │       ├── geofences/[id]/route.js                  # 405 차단 (단일 진실원: TeslaMate UI)
    │       ├── now-command/route.js                     # 즉시 실행 (NowPanel) — schedule 없이 단발 액션
    │       ├── usage/current-month/route.js             # 이번달 Tesla Fleet API 누적 사용량 + 예상 비용 (UsageCard)
    │       ├── holidays/route.js                        # KASI 특일정보 캐시 (한국 공휴일 — 캘린더/이력에서 공통 사용)
    │       └── tesla-test/ping/route.js                 # Tesla Fleet API connectivity ping — /v2/dev/api-status 자동화 카테고리
```

## 라우트

| 경로 | 설명 | 하단 탭 |
|------|------|---------|
| `/` | `/v2/drives`로 리다이렉트 | — |
| `/v2/drives` | 차량 KPI · 인사이트 · 시간×요일 패턴 · TOP50 · 연도별 월간/계절 효율 | 주행 |
| `/v2/battery` | 건강 점수 + 대기 소모 + 충전 습관 + 월간 충전(시간×요일 그래프) + 급속/완속 기록 | 배터리 |
| `/v2/history` | 일 카드 리스트 → 일 상세(지도 + 그날 주행 strip 하이라이트) / 월 합계(monthMode) | 이력 |
| `/v2/chargers` | 집충전기 실시간 + Top 순위 + 활용도 리포트 (인라인) | 충전소 |
| `/v2/chargers/report` | 활용도 리포트 단독 페이지 (외부 캡처/공유) | — (URL 직접) |
| `/v2/tg` | 텔레그램 봇 관리 (권한 · 방송 · 학습로그 · 가이드) | — (URL 직접) |
| `/v2/schedule` | Tesla 자동화 — 사용량 + 세로 캘린더(다음/마지막 실행 핫바·일자별 plan/exec) + 휴무 + 스케줄 리스트 + 전체 이력. ⚙ 시트 = 즉시실행/지오펜스/실연동체크 | — (하단 알약 ⚙️ 시트에서 진입) |
| `/v2/dev/api-status` | 3탭 (서버 / API 테스트 / 집계) — API 가용성 + 서버 진단 + 사전집계 상태/갱신 (개발자용, URL 직접) | — (하단 알약 미노출) |
| `/v2/dev/auth` | 로그인 PIN 변경 (하단 알약 좌측 ⚙️ 시트에서 진입) | — (하단 알약 미노출) |
