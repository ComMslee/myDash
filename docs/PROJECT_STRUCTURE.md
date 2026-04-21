# 프로젝트 구조

```
myDash/
├── CLAUDE.md                   # Claude 에이전트 지침 (요약)
├── docker-compose.yml          # teslamate + database + mosquitto + dashboard
├── .github/workflows/deploy.yml
├── docs/                       # 상세 문서
└── dashboard/
    ├── Dockerfile
    ├── package.json
    ├── next.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── jsconfig.json             # @/ → dashboard/ 경로 별칭
    ├── instrumentation.js        # Next.js 기동 시 집충전기 캐시 warm-up
    ├── lib/
    │   ├── db.js                 # PostgreSQL 커넥션 풀 (싱글턴)
    │   ├── constants.js          # KWH_PER_KM, RATED_RANGE_MAX_KM
    │   ├── format.js             # formatDuration, formatDate, shortAddr, formatKorDate
    │   └── home-charger-cache.js # 환경공단 API 캐시 + 동적 TTL 학습
    ├── app/
    │   ├── layout.js             # 루트 레이아웃 (MockProvider, GlobalHeader, BottomNav)
    │   ├── globals.css           # Tailwind 지시어 + Leaflet 다크 테마 오버라이드
    │   ├── page.js               # 홈 — 최근 주행 + 6개월 통합 카드
    │   ├── context/
    │   │   └── mock.js           # MockProvider + MOCK_DATA (개발용 가상 데이터)
    │   ├── components/
    │   │   ├── GlobalHeader.js   # 차량 상태/배터리/충전 상태 헤더 (sticky)
    │   │   ├── BottomNav.js      # 하단 탭 네비게이션 (홈/주행/월별/배터리)
    │   │   ├── PageLayout.js     # Card, Spinner, SectionLabel 공유 컴포넌트
    │   │   └── ChartWidgets.js   # HourlyHeatmap, WeekdayBars 차트
    │   ├── drives/
    │   │   └── page.js           # 주행 상세 — 지도 + 주행 이력 리스트 + 자주 가는 곳
    │   ├── monthly/
    │   │   └── page.js           # 월별 — 달력 + 6개월 차트 + 효율 트렌드 + 연도별 통계
    │   └── battery/
    │       ├── page.js                   # 배터리 — 건강/집충전기/충전 습관/충전 상세
    │       ├── HealthScoreCard.js        # 점수(등급)·평균 SOC·용량 추이 + SOC 체류 분포
    │       ├── IdleDrainCard.js          # 대기 소모 24h 타임라인
    │       ├── HomeChargerCard.js        # 집충전기 실시간 상태 (환경공단 API)
    │       ├── home-charger/             # 집충전기 카드 내부 모듈
    │       │   ├── constants.js          # ID 매핑, 동 배치, 상태 메타, 주기 상수
    │       │   ├── utils.js              # computeRanks, elapsedLabel, buildTtlTooltip 등
    │       │   └── ChargerTile.js        # UnifiedCell, TileBox, StatusBadges, MiniGrid
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
        ├── insights/route.js         # 6개월 집계 + 시간대/요일 패턴
        ├── monthly-history/route.js  # 24개월 월별 주행/충전/효율
        ├── battery/route.js          # 배터리 건강 + 히스토그램 + 대기 소모
        ├── battery-trend/route.js    # 배터리 용량/습관 월별 트렌드
        ├── charge-all-time/route.js  # 누적 충전 비용
        ├── frequent-places/route.js  # 자주 방문 장소 랭킹
        ├── route-map/route.js        # 특정 주행의 GPS 경로
        ├── heatmap/route.js          # 히트맵 데이터
        └── home-charger/route.js     # 집충전기 실시간 (환경공단 EvCharger API + 시간대별 캐시)
```

## 페이지 (4탭)

| 경로 | 탭 이름 | 설명 |
|------|---------|------|
| `/` | 홈 | 최근 주행 통계(오늘/이번주/저번주/이번달) + 최근 3건 + 6개월 통합(주행/충전 탭) |
| `/drives` | 주행 | Leaflet 지도 + 주행 이력 리스트(200건) + 자주 가는 곳 TOP5 |
| `/monthly` | 월별 | 달력(일별 km/충전) + 6개월 바 차트 + 효율 트렌드 + 연도별 요약 |
| `/battery` | 배터리 | 건강 점수(등급/평균SOC/추이) + 대기 소모 + **집충전기 실시간** + 충전 습관 + 급속/완속 기록 |
