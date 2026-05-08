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
    │   ├── queries/              # 도메인별 SQL 쿼리 모듈
    │   │   ├── battery-capacity.js
    │   │   ├── battery-health.js
    │   │   ├── battery-idle.js
    │   │   ├── battery-records.js
    │   │   ├── car.js                  # getDefaultCar() — 단일 차량 조회 헬퍼 (10+ 라우트 공유)
    │   │   └── family-festivals.js     # family_festivals 테이블 스키마/CRUD — GHA cron 폴링 결과 저장
    │   └── home-charger/         # 집충전기 서버사이드 로직
    │       ├── fleet-stats.js    # 단지 통계 집계
    │       ├── poll-log.js       # 폴링 로그 조회
    │       ├── schema.js         # DB 스키마 정의
    │       └── usage.js          # 사용량 계산
    ├── app/
    │   ├── layout.js             # 루트 레이아웃 (MockProvider, GlobalHeader)
    │   ├── globals.css           # Tailwind 지시어 + Leaflet 다크 테마 오버라이드
    │   ├── page.js               # `/` → `/v2` 리다이렉트
    │   ├── login/page.js         # PIN 로그인 페이지 (`/login?next=...`) — Caddy forward_auth 미인증 리다이렉트 진입점
    │   ├── setup/page.js         # 초기 PIN 설정 페이지 (`/setup`) — auth-store 비어있을 때만 노출
    │   ├── context/
    │   │   └── mock.js           # MockProvider + MOCK_DATA (개발용 가상 데이터)
    │   ├── components/           # 공용 컴포넌트 (v1·v2 공유)
    │   │   ├── GlobalHeader.js   # 차량 상태/배터리/충전 상태 헤더 (sticky)
    │   │   ├── PageLayout.js     # Spinner 공유 컴포넌트
    │   │   ├── ChartWidgets.js   # HourlyHeatmap, WeekdayBars 차트
    │   │   ├── DriveMap.js       # Leaflet 주행 경로 지도 — positions(단일) / routes(다중, 일 합계) / highlightLatLng(포인트) / highlightRouteId(다중 모드 한 구간 강조 + zoom)
    │   │   ├── RouteSparklines.js # 속도/고도/온도 3행 스파크라인 + 포인터 스크럽 선택
    │   │   └── YearHeatmap.js    # 연간 히트맵 (GitHub 스타일)
    │   ├── v2/                   # v2 앱 (현재 메인)
    │   │   ├── layout.js         # v2 레이아웃 (BottomNavV2 포함)
    │   │   ├── page.js           # `/v2` → `/v2/drives` 리다이렉트
    │   │   ├── components/
    │   │   │   ├── BottomNavV2.js    # 하단 탭 (주행/이력/배터리/집 충전소) + 탭별 라이브 메트릭 1줄 + 실측 nav 높이 publish (--peek-nav-h)
    │   │   │   ├── RankingsSheet.js  # 랭킹 바텀시트
    │   │   │   └── PeekSheet.js      # 4탭 공용 표지(peek) 시트 — Provider/Context + 탭별 Cover/Expanded + /api/v2/quick-status 60초 폴링 + 드래그 확장(↑32px)/축소(↓80px)
    │   │   ├── drives/
    │   │   │   ├── page.js                   # 주행 분석 — 차량 KPI + 인사이트 + 연간 히트맵 + 패턴 + TOP50 + 연도별 월간
    │   │   │   └── _parts/
    │   │   │       ├── VehicleKpiCard.js     # 차량 누적·효율·주행 KPI (전기간 인라인)
    │   │   │       ├── MonthInsightsCard.js  # 이번달 인사이트 (4주 롤링)
    │   │   │       ├── RecordsCardV2.js      # TOP 50 기록 + 랭킹 시트
    │   │   │       ├── MonthlyHistoryByYear.js # 연도별 월간 통계 막대
    │   │   │       └── SeasonalEffGrid.js    # 계절별 효율 그리드
    │   │   ├── battery/
    │   │   │   ├── page.js                   # 배터리 — 건강/대기 소모/충전 습관/월간·히트맵/급속·완속 — 섹션 anchor #health/#idle/#monthly/#heatmap/#fast/#slow (PeekSheet 메뉴 점프용)
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
    │   │   │   │   ├── PollLogPopup.js       # 폴링 로그 팝업 (레거시 — 본문은 PollLogBody 재사용, /v2/chargers 는 PeekSheet 가 대체)
    │   │   │   │   ├── poll-log/PollLogBody.js  # 폴링 로그 본문 — PollLogPopup·PeekSheet 양쪽에서 공유
    │   │   │   │   └── fleet-stats-utils.js  # 통계 집계 유틸
    │   │   │   ├── MonthlyChargeCard.js      # 집/외부·완/급속 비율 + 시간×요일 히트맵 (24열 SOC 시작→종료 띠 동봉)
    │   │   │   ├── ChargeHeatmap.js
    │   │   │   ├── FastChargeCard.js
    │   │   │   └── SlowChargeCard.js
    │   │   ├── history/
    │   │   │   ├── page.js           # 이력 페이지 — 리스트(일 카드) / dayMode(지도 + 컴팩트 strip 하이라이트) / monthMode(월 합계) / 단일 주행. 자주 가는 곳·오래 머문 곳 placesMode 탭 토글 포함
    │   │   │   ├── DriveListView.js  # 월 그룹 → 일 카드 (24h 막대 + 🚗/🛣️/🅿️ 메타라인). 일 카드 탭 = onDayClick(dateStr)
    │   │   │   └── useDriveData.js   # drives + dayRoutes/monthRoutes 병렬 fetch (CLAUDE.md DriveMap 함정 5개 상주)
    │   │   ├── chargers/
    │   │   │   ├── page.js               # 집충전기 실시간 + Top 순위 + 활용도 리포트 인라인 — 섹션 anchor #live/#fleet/#report (PeekSheet 메뉴 점프용)
    │   │   │   ├── _parts/ReportPanel.js # 활용도 라이브 리포트 컴포넌트 (KPI · 주별 추이 · 동별)
    │   │   │   ├── report/page.js        # 활용도 리포트 단독 페이지 (외부 캡처/공유)
    │   │   │   └── poll-log/page.js      # 폴링 로그 단독 페이지 — PeekSheet 메뉴에서 진입 (PollLogBody 래퍼)
    │   │   ├── tg/page.js            # 텔레그램 봇 관리 (권한·방송·학습로그·가이드)
    │   │   └── dev/                  # 개발/진단 도구 (하단 탭·헤더 미노출, URL 직접)
    │   │       ├── api-status/
    │   │       │   └── page.js       # 29개 라우트 가용성 체크 + 서버/충전/폴링 진단 통합
    │   │       └── auth/
    │   │           └── page.js       # 로그인 PIN 변경 (단일 사용자)
    │   └── api/                  # 서버사이드 API 라우트 (모두 GET, force-dynamic)
    │       ├── car/route.js              # 차량 기본 정보 + 배터리 + 상태
    │       ├── charging-status/route.js  # 현재 충전 상태
    │       ├── drives/route.js           # 주행 통계(오늘/주/월) + 최근 주행 목록
    │       ├── charges/route.js          # 충전 이력 + 월간/전체 비용
    │       ├── fast-charges/route.js     # 급속 충전 기록
    │       ├── slow-charges/route.js     # 완속 충전 기록
    │       ├── insights/route.js         # 6개월 집계 + 시간대/요일 패턴
    │       ├── monthly-history/route.js  # 24개월 월별 주행/충전/효율
    │       ├── battery/route.js          # 배터리 건강 + 히스토그램 + 대기 소모
    │       ├── battery-trend/route.js    # 배터리 용량/습관 월별 트렌드
    │       ├── charge-all-time/route.js  # 누적 충전 비용
    │       ├── frequent-places/route.js  # 자주 방문 장소 랭킹
    │       ├── long-stay-places/route.js # 오래 머문 장소 랭킹 (drives LEAD 윈도우로 dwell 산출, ≥10분만)
    │       ├── rankings/route.js         # 랭킹 페이지 데이터
    │       ├── route-map/route.js        # 특정 주행의 GPS 경로
    │       ├── heatmap/route.js          # 히트맵 데이터
    │       ├── year-heatmap/route.js     # 연간 히트맵 데이터
    │       ├── home-charger/route.js              # 집충전기 실시간 (환경공단 EvCharger API + 시간대별 캐시)
    │       ├── home-charger/fleet-stats/route.js  # 집충전기 단지 통계
    │       ├── home-charger/groups/route.js       # 동별 그룹 카운트 (constants.js 매핑) — 봇 /chargers
    │       ├── home-charger/report/route.js       # 활용도 리포트 (KPI·주별·동별) — /v2/chargers/report 페이지
    │       ├── home-charger/poll-log/route.js     # 폴링 로그 조회
    │       ├── v2/quick-status/route.js           # 4탭(주행·이력·배터리·집충전소) 표지/내비용 라이브 메트릭 통합 — PeekSheet 가 60초 폴링
    │       ├── summary/route.js                   # drives+charges 일자 집계 (range=multi 등) — 봇 /period
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
    │       └── server-status/route.js         # 호스트(/proc/meminfo · statfs) + 컨테이너(docker.sock) + DB 로그(server_health_log) + 24h 피크/한산 — /v2/dev/api-status 4열 대시보드용
```

## 라우트

| 경로 | 설명 | 하단 탭 |
|------|------|---------|
| `/` | `/v2/drives`로 리다이렉트 | — |
| `/v2/drives` | 차량 KPI · 인사이트 · 연간 히트맵 · 시간×요일 패턴 · TOP50 · 연도별 월간/계절 효율 | 주행 |
| `/v2/battery` | 건강 점수 + 대기 소모 + 충전 습관 + 월간 충전 + 히트맵 + 급속/완속 기록 | 배터리 |
| `/v2/history` | 일 카드 리스트 → 일 상세(지도 + 그날 주행 strip 하이라이트) / 월 합계(monthMode) | 이력 |
| `/v2/chargers` | 집충전기 실시간 + Top 순위 + 활용도 리포트 (인라인) | 집 충전소 |
| `/v2/chargers/report` | 활용도 리포트 단독 페이지 (외부 캡처/공유) | — (URL 직접) |
| `/v2/chargers/poll-log` | 폴링 로그 단독 페이지 — PeekSheet 의 집충전소 expanded 메뉴에서 진입 | — (URL 직접) |
| `/v2/tg` | 텔레그램 봇 관리 (권한 · 방송 · 학습로그 · 가이드) | — (URL 직접) |
| `/v2/dev/api-status` | API 가용성 + 서버/진단 (개발자용, URL 직접) | — (헤더·탭 미노출) |
| `/v2/dev/auth` | 로그인 PIN 변경 (헤더 우측 ⚙️ 시트에서 진입) | — (헤더·탭 미노출) |
