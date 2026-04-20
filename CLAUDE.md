# TeslaMate Custom Dashboard

TeslaMate PostgreSQL 데이터를 시각화하는 Next.js 14 기반 모바일 우선 대시보드.

## 배포

`master` 브랜치 push 시 GitHub Actions(self-hosted runner)가 자동 배포한다 (`.github/workflows/deploy.yml`). 따라서 일반적으로는 코드 수정 후 빌드/배포를 직접 실행하지 않는다.

사용자가 명시적으로 요청할 때만 로컬 빌드/배포를 실행한다:

```bash
docker-compose build dashboard && docker-compose up -d dashboard
```

## 기술 스택

- **프레임워크**: Next.js 14 (App Router) — 포트 5000
- **언어**: JavaScript (ESM, `"type": "module"`)
- **스타일링**: Tailwind CSS 3 — 인라인 유틸리티 클래스, 커스텀 CSS 최소화
- **DB**: PostgreSQL 16 (TeslaMate 스키마) — `pg` 라이브러리 직접 쿼리
- **지도**: Leaflet 1.9 (CDN 동적 로드, CartoDB Dark 타일)
- **컨테이너**: Docker (node:20-alpine)
- **CI/CD**: GitHub Actions → self-hosted runner → docker compose

## 프로젝트 구조

```
myDash/
├── CLAUDE.md
├── docker-compose.yml          # teslamate + database + mosquitto + dashboard
├── .github/workflows/deploy.yml
└── dashboard/
    ├── Dockerfile
    ├── package.json
    ├── next.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── jsconfig.json             # @/ → dashboard/ 경로 별칭
    ├── lib/
    │   ├── db.js                 # PostgreSQL 커넥션 풀 (싱글턴)
    │   ├── constants.js          # KWH_PER_KM, RATED_RANGE_MAX_KM
    │   └── format.js             # formatDuration, formatDate, shortAddr, formatKorDate
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
    │       ├── page.js           # 배터리 — 상태/충전 습관/대기 소모
    │       ├── HealthScoreCard.js
    │       ├── BatteryTrendCard.js
    │       ├── CycleCard.js
    │       ├── IdleDrainCard.js
    │       ├── RecordsHabit.js
    │       ├── MonthlyChargeCard.js
    │       └── WeeklyCard.js
    └── app/api/                  # 서버사이드 API 라우트 (모두 GET, force-dynamic)
        ├── car/route.js          # 차량 기본 정보 + 배터리 + 상태
        ├── charging-status/route.js  # 현재 충전 상태
        ├── drives/route.js       # 주행 통계(오늘/주/월) + 최근 주행 목록
        ├── charges/route.js      # 충전 이력 + 월간/전체 비용
        ├── insights/route.js     # 6개월 집계 + 시간대/요일 패턴
        ├── monthly-history/route.js  # 24개월 월별 주행/충전/효율
        ├── battery/route.js      # 배터리 건강 + 히스토그램 + 대기 소모
        ├── battery-trend/route.js    # 배터리 용량/습관 월별 트렌드
        ├── charge-all-time/route.js  # 누적 충전 비용
        ├── frequent-places/route.js  # 자주 방문 장소 랭킹
        ├── route-map/route.js    # 특정 주행의 GPS 경로
        └── heatmap/route.js      # 히트맵 데이터
```

## 페이지 (4탭)

| 경로 | 탭 이름 | 설명 |
|------|---------|------|
| `/` | 홈 | 최근 주행 통계(오늘/이번주/저번주/이번달) + 최근 3건 + 6개월 통합(주행/충전 탭) |
| `/drives` | 주행 | Leaflet 지도 + 주행 이력 리스트(200건) + 자주 가는 곳 TOP5 |
| `/monthly` | 월별 | 달력(일별 km/충전) + 6개월 바 차트 + 효율 트렌드 + 연도별 요약 |
| `/battery` | 배터리 | 건강 점수 + 용량 트렌드 + 충전 습관 히스토그램 + 대기 소모 |

## 데이터베이스

TeslaMate가 관리하는 PostgreSQL 스키마. 직접 쿼리만 사용 (ORM 없음).

### 주요 테이블

| 테이블 | 용도 |
|--------|------|
| `cars` | 차량 정보 (id, name) |
| `drives` | 주행 기록 (distance, duration_min, start/end_rated_range_km, speed_max) |
| `charging_processes` | 충전 기록 (charge_energy_added, cost, geofence_id) |
| `positions` | GPS 위치 + 배터리 레벨 |
| `states` | 차량 상태 (driving, parked, suspended, online) |
| `addresses` | 주소 정보 (name, road, display_name) |
| `geofences` | 지오펜스 (집충전 판별에 사용) |

### 환경 변수

| 변수 | 설명 |
|------|------|
| `TM_DB_USER` | PostgreSQL 사용자명 |
| `TM_DB_PASS` | PostgreSQL 비밀번호 |
| `TM_DB_NAME` | 데이터베이스 이름 (기본값: `teslamate`) |
| `DB_HOST` | DB 호스트 (기본값: `database`) |
| `ENCRYPTION_KEY` | TeslaMate 암호화 키 |

## 상수 (`lib/constants.js`)

| 상수 | 값 | 용도 |
|------|-----|------|
| `KWH_PER_KM` | 0.150 | rated range km → kWh 환산 (Model 3 기준) |
| `RATED_RANGE_MAX_KM` | 350 | 배터리 % 계산 기준 최대 주행거리 |

## 유틸리티 (`lib/format.js`)

| 함수 | 설명 |
|------|------|
| `formatDuration(min)` | 분 → "X시간 Y분" 또는 "Y분" |
| `formatDate(iso)` | ISO → "M월 D일 HH:MM" |
| `shortAddr(addr)` | 주소의 첫 번째 쉼표 이전 부분만 반환 |
| `formatKorDate(iso)` | ISO → "YY/MM/DD" 또는 "MM/DD" (올해면 연도 생략) |

## 코딩 규칙

### UI/UX
- **한국어 UI** — 모든 레이블, 에러 메시지, 단위 표시
- **다크 테마** — 배경 `#0f0f0f`, 카드 `#161618`, 테두리 `border-white/[0.06]`
- **모바일 우선** — `max-w-2xl mx-auto`, 하단 탭 네비게이션(safe-area 대응)
- **색상 팔레트**: 주행=blue-400, 충전=green-400, 효율=amber-400, 에러=red-400

### 데이터
- **KST(UTC+9)** 기준 날짜/시간 처리 — SQL에서 `+ INTERVAL '9 hours'` 또는 JS에서 수동 변환
- **API 라우트**: 모두 `export const dynamic = 'force-dynamic'` (SSR 캐시 비활성화)
- **단일 차량**: `SELECT id FROM cars LIMIT 1` 패턴으로 항상 첫 번째 차량만 조회
- **30초 자동 갱신**: 홈, 헤더에서 setInterval(30000)로 폴링

### 컴포넌트
- `'use client'` 지시어 — 모든 페이지/컴포넌트에 사용
- Tailwind 인라인 스타일 — 별도 CSS 파일 최소화
- `tabular-nums` — 숫자 표시에 고정 폭 숫자 사용
- 공유 컴포넌트는 `components/` 또는 `lib/`에, 페이지 전용은 해당 폴더에 배치

### 개발 모드
- Mock 시스템 (`context/mock.js`) — 개발 환경에서 "가상" 버튼으로 DB 없이 테스트
- `NODE_ENV !== 'production'`일 때만 Mock 토글 버튼 표시

## 커밋 스타일

```
<type>: <한글 또는 영문 설명>
```

타입: `feat`, `fix`, `ci`, `docs`

## 외부 API 참고

- **한국환경공단 전기자동차 충전소 정보** — 공공 충전소 위치/상태 조회 API. 엔드포인트, 인증키 보관, 호출 함정(HTTPS/UA/numOfRows), 오퍼레이션, Next.js 라우트 예시는 [`docs/EV_CHARGER_API.md`](./docs/EV_CHARGER_API.md) 참고.
