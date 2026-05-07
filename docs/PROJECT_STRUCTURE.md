# 프로젝트 구조

```
myDash/
├── CLAUDE.md                   # Claude 에이전트 지침 (요약)
├── docker-compose.yml          # teslamate + teslamate-auth + database + mosquitto + dashboard
├── docker-compose.tailscale.yml
├── nginx-teslamate.conf        # teslamate-auth (4000번) basic-auth 프록시
├── nginx-teslamate.htpasswd    # (gitignore) 배포 시 없으면 자동 생성
├── .github/workflows/deploy.yml
├── docs/                       # 상세 문서
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
    │   ├── format.js             # formatDuration, formatDate, shortAddr, formatKorDate
    │   ├── kst.js                # KST(UTC+9) 시간 변환 헬퍼
    │   ├── effColor.js           # 효율 색상 매핑
    │   ├── kakao-geo.js          # Kakao Local 역지오코딩 (DB 캐시 우선)
    │   ├── home-charger-cache.js # 환경공단 API 캐시 + 동적 TTL(3~30분) + DB 스냅샷 영속화 + 시간당 사용 카운트
    │   └── queries/              # 배터리 관련 SQL 쿼리 모듈
    │       ├── battery-capacity.js
    │       ├── battery-health.js
    │       ├── battery-idle.js
    │       └── battery-records.js
    ├── app/
    │   ├── layout.js             # 루트 레이아웃 (MockProvider, GlobalHeader, BottomNav)
    │   ├── globals.css           # Tailwind 지시어 + Leaflet 다크 테마 오버라이드
    │   ├── page.js               # `/` → `/drives` 리다이렉트
    │   ├── context/
    │   │   └── mock.js           # MockProvider + MOCK_DATA (개발용 가상 데이터)
    │   ├── components/
    │   │   ├── GlobalHeader.js   # 차량 상태/배터리/충전 상태 헤더 (sticky)
    │   │   ├── BottomNav.js      # 하단 탭 (주행/배터리/로드트립)
    │   │   ├── PageLayout.js     # Spinner 공유 컴포넌트
    │   │   ├── ChartWidgets.js   # HourlyHeatmap, WeekdayBars 차트
    │   │   ├── DriveMap.js       # Leaflet 기반 주행 경로 지도 (highlightLatLng 포인트 하이라이트)
    │   │   ├── RouteSparklines.js # 속도/고도/온도 3행 스파크라인 + 포인터 스크럽 선택
    │   │   └── YearHeatmap.js    # 연간 히트맵 (GitHub 스타일)
    │   ├── drives/
    │   │   └── page.js           # 주행 상세 — 통계 + 지도 + 이력
    │   ├── rankings/
    │   │   └── page.js           # 랭킹 (최장/최고속 등)
    │   ├── roadtrips/
    │   │   ├── page.js           # 로드트립 — 장거리 주행 묶음
    │   │   ├── DriveListView.js  # 리스트 뷰
    │   │   └── useDriveData.js   # 주행 데이터 훅
    │   └── battery/
    │       ├── page.js                   # 배터리 — 건강/집충전기/충전 습관/충전 상세
    │       ├── HealthScoreCard.js        # 점수(등급)·평균 SOC·용량 추이 + SOC 체류 분포
    │       ├── IdleDrainCard.js          # 대기 소모 24h 타임라인
    │       ├── useIdleDrainDays.js       # 대기 소모 일자별 데이터 훅
    │       ├── HomeChargerCard.js        # 집충전기 실시간 상태 (환경공단 API)
    │       ├── home-charger/             # 집충전기 카드 내부 모듈
    │       │   ├── constants.js          # ID 매핑, 동 배치, 상태 메타, 주기 상수
    │       │   ├── utils.js              # computeRanks, elapsedLabel, buildTtlTooltip 등
    │       │   ├── ChargerTile.js        # UnifiedCell, TileBox, StatusBadges, MiniGrid
    │       │   ├── FleetStatsCharts.js   # 집단 통계 차트
    │       │   ├── FleetStatsPopup.js    # 통계 팝업
    │       │   ├── PollLogPopup.js       # 폴링 로그 팝업
    │       │   └── fleet-stats-utils.js  # 통계 집계 유틸
    │       ├── RecordsHabit.js           # 충전 시작/종료 SOC Range Bar
    │       ├── MonthlyChargeCard.js
    │       ├── ChargeHeatmap.js
    │       ├── FastChargeCard.js
    │       ├── SlowChargeCard.js
    │       ├── CycleCard.js
    │       └── WeeklyCard.js
    └── app/api/                  # 서버사이드 API 라우트 (모두 GET, force-dynamic)
        ├── car/route.js              # 차량 기본 정보 + 배터리 + 상태
        ├── charging-status/route.js  # 현재 충전 상태
        ├── drives/route.js           # 주행 통계(오늘/주/월) + 최근 주행 목록
        ├── charges/route.js          # 충전 이력 + 월간/전체 비용
        ├── fast-charges/route.js     # 급속 충전 기록
        ├── slow-charges/route.js     # 완속 충전 기록
        ├── insights/route.js         # 6개월 집계 + 시간대/요일 패턴
        ├── monthly-history/route.js  # 24개월 월별 주행/충전/효율
        ├── battery/route.js          # 배터리 건강 + 히스토그램 + 대기 소모
        ├── battery-trend/route.js    # 배터리 용량/습관 월별 트렌드
        ├── charge-all-time/route.js  # 누적 충전 비용
        ├── frequent-places/route.js  # 자주 방문 장소 랭킹
        ├── rankings/route.js         # 랭킹 페이지 데이터
        ├── route-map/route.js        # 특정 주행의 GPS 경로
        ├── heatmap/route.js          # 히트맵 데이터
        ├── year-heatmap/route.js     # 연간 히트맵 데이터
        ├── home-charger/route.js     # 집충전기 실시간 (환경공단 EvCharger API + 시간대별 캐시)
        └── find-nearby-chargers/route.js  # 좌표 기반 주변 충전소 검색
```

## 라우트

| 경로 | 설명 | 하단 탭 |
|------|------|---------|
| `/` | `/drives`로 리다이렉트 | — |
| `/drives` | 주행 통계 + 지도 + 이력 | 주행 |
| `/battery` | 건강 점수 + 대기 소모 + 집충전기 + 충전 습관 + 급속/완속 기록 | 배터리 |
| `/roadtrips` | 장거리 주행(로드트립) 묶음 | 로드트립 |
| `/rankings` | 기록 랭킹(최장 주행, 최고 속도 등) | — (직접 URL) |
