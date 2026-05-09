# 코딩 규칙

## UI/UX

- **한국어 UI** — 모든 레이블, 에러 메시지, 단위 표시
- **다크 테마** — 배경 `#0f0f0f`, 카드 `#161618`, 중첩 카드 `#1a1a1c`, 테두리 `border-white/[0.06]`
- **모바일 우선** — `max-w-2xl mx-auto`, 하단 탭 네비게이션 (safe-area 대응)
- **색상 팔레트** — 의미별 고정, 형광/채도 과한 색(`fuchsia`, `violet` 등) 지양
  - 주행 = `blue-400` / `sky-400`
  - 충전 = `emerald-400` (heatmap/바 등 그라디언트도 emerald 계열 통일. `green-400`은 점진 교체)
  - 효율 · 외부충전 · 주의 = `amber-400`
  - 급속 · 에러 = `rose-400` / `red-400`
  - 고도 = `lime-400`, 온도 = `orange-400`
  - 랭크 강조 ring = `amber-400`
  - 선택 하이라이트(지도/스파크라인) = `white`
- **농도 3-tier** — 강약 표현은 5단계 이상 세분화하지 말고 `emerald-400 → amber-400 → red-400` 3단계로 제한 (예: 대기 손실 타임라인)
- **밴드/오버레이** — 배경 위 반투명 밴드는 `rgba(..., 0.5)` 이하 톤다운 (`sky` 공조, `fuchsia` 센트리 등)

## 데이터

- **KST(UTC+9)** 기준 날짜/시간 처리
  - SQL: `+ INTERVAL '9 hours'`
  - JS: **`dashboard/lib/kst.js`의 헬퍼를 사용** (`toKstDate`, `kstDateStr`, `kstMondayStr`, `kstDayOfWeek`, `formatHM`, `formatTimeRange`, `splitByKstMidnight`) — `+ 9*60*60*1000` 매직 넘버 직접 사용 금지
  - `toKstDate()`로 얻은 Date는 **`getUTCHours()` 등 UTC-getter로 KST 값을 읽음**. `getHours()` 사용 금지
- **API 라우트**: 모두 `export const dynamic = 'force-dynamic'` (SSR 캐시 비활성화)
- **API 입력 검증**: URL 쿼리 파라미터 등 외부 입력은 `parseInt` + `Number.isFinite` + 범위 체크 후 사용 (예: `route-map/route.js`의 `driveId`)
- **에러 응답**: `err.message`를 응답 본문에 그대로 노출하지 말 것 (DB 경로/스키마 정보 유출 위험). `console.error`로만 로깅하고 클라이언트에는 일반 메시지
- **단일 차량**: `SELECT id FROM cars LIMIT 1` 패턴으로 항상 첫 번째 차량만 조회
- **자동 갱신 주기**:
  - 홈/헤더: 30초 (setInterval)
  - 집충전기 클라이언트 폴링: 60초 (`POLL_INTERVAL_MS`)
  - 집충전기 서버 캐시 TTL: 정적 5~12분(시간대별 `CACHE_TIERS`). 동적 모드(`USE_DYNAMIC_TTL=true`) 활성화 시 4~15분 clamp + 90일 히스토리 학습(현재 비활성)
  - 집충전기 instrumentation keep-warm: 2분마다 점검 (fresh면 no-op)
  - 집충전기 사용 카운트(`charger_usage`): 30분당 최대 1회 증가 (시간당 최대 1회)

## 컴포넌트

- `'use client'` 지시어 — 페이지/인터랙티브 컴포넌트에 사용 (서버 컴포넌트 구분)
- Tailwind 인라인 스타일 — 별도 CSS 파일 최소화
- `tabular-nums` — 숫자 표시에 고정 폭 숫자 사용
- 배치:
  - 전역 공유 유틸 → `dashboard/lib/`
  - 전역 공유 컴포넌트 → `dashboard/app/components/`
  - 페이지 전용 컴포넌트 → 해당 라우트 폴더
  - 복잡한 컴포넌트 내부 모듈 → 동명 서브폴더 (예: `HomeChargerCard.js` + `home-charger/`)
- **fetch 정리**: `useEffect` 내 fetch는 `AbortController`로 언마운트/파라미터 변경 시 취소 (`setState`-after-unmount 경고 방지) — 예: `app/v2/history/useDriveData.js`
- **비싼 계산**: 배열 flat/stats/패스 생성 등은 `useMemo`로 메모이즈 (예: `RouteSparklines.js`)

### Provider/Sheet 공유 패턴

여러 페이지가 공유하는 모달/시트는 `createContext` + `Provider` + 커스텀 훅 형태로 작성, 레이아웃에서 한 번만 마운트:

| 컴포넌트 | 트리거 | 데이터 |
|---|---|---|
| `RankingsSheet` | `useRankingsSheet().open(metric, base)` | 호출 시 `/api/rankings` fetch (사용자 액션 트리거) |
| `PeekSheet` | 자동 (페이지 진입) | `/api/v2/quick-status` 60초 폴링 + visibilitychange 즉시 갱신 |

`PeekSheet` 는 4탭 공용 표지(peek) — `usePathname()` 으로 활성 탭 결정, 탭별 Cover/Expanded 컴포넌트가 데이터 슬라이스 표시. 탭 전환 시 자동 축소(`expanded=false`). 내비바 실측 높이는 `--peek-nav-h` CSS 변수로 publish, peek 높이는 `--peek-h` 로 publish → 페이지 padding-bottom 자동 보정.

**Expanded = cover 미노출 정보 + 칩 패턴** (주행·배터리, 단순 메뉴 X): cover 가 이미 표시한 정보는 expanded 에서 다시 안 보여줌 (중복 제거). expanded 는 cover 에 없는 추가 데이터(예: 주행=이번 주 건수/거리)만 InfoCard 로, 그 아래 칩(ChipBtn) 행으로 세부 섹션 점프. `useMenuNav()` 이 같은 페이지면 `scrollIntoView`, 다른 페이지면 `router.push`. 본문 디테일은 페이지에 두고 시트는 라이브 요약 + 진입 launcher 역할.

**폴링 진단 정보는 사용자 시야에서 demote**: 충전소 폴링 성공률·TTL·갱신시각은 사용자에게 의미 있는 정보가 아니라 시스템 진단 데이터. peek cover/expanded, home page 의 prominent 카드/칩 어디에도 노출 X. `/chargers/poll-log` 페이지는 보존(URL 직접 접근 / `/v2/dev/api-status` 에서 진입). 사용자에게 의미 있는 충전소 데이터(사용량 통계·시간×요일 히트맵·활용도 리포트) 만 home/peek 에 노출.

**한 정보 = 한 큰 표시소**: 같은 메트릭이 여러 surface 에서 prominent 하게 반복되지 않도록 1차 위치를 정함. 예) SOC 큰 링: home hero ↔ peek battery cover 중 활성 컨텍스트만, BottomNav 의 "78%" 는 작은 보조. 오늘 km: home 주행요약 ↔ peek drives cover 중 활성 컨텍스트만, BottomNav 의 "25.4km" 는 작은 보조. 주의: 충전 중 kW 도 동일 원칙 — cover 에서 큰 표시, expanded 에선 반복 X.

**3탭 BottomNav (홈/주행/배터리) — 활성 탭만 라벨**: 한국 지도 앱(네이버/카카오/T맵) 표준은 항상 라벨 노출이지만 우리는 절충. 활성 탭만 텍스트 라벨로 위치 명시성 확보, 비활성 탭은 SVG 아이콘 + 라이브 메트릭만(컴팩트). 라벨이 동적으로 추가/제거되니 nav 높이가 활성 상태에 따라 달라짐 — `ResizeObserver` 가 `--peek-nav-h` CSS 변수를 자동 갱신해 peek 시트가 흔들림 없이 안착. `이력(/history)` 은 주행 그룹, `집충전소(/chargers, /chargers/*)` 는 배터리 그룹으로 흡수 — `matches` prefix 배열로 sub-page 까지 active 매칭. 홈 탭은 peek 자체가 안 뜸 (`TAB_META.home.peekH = 0` + `PeekSheet` 가 `activeTab === 'home'` 일 때 null 반환).

## 성능 · 안전성

- **`Math.max(...arr)` / `Math.min(...arr)` 금지** — V8 인자 상한(~65k)으로 긴 배열에서 `RangeError` 발생. `for` 루프로 단일 패스 계산 (예: `RouteSparklines.js::computeStats`, `api/route-map/route.js`의 속도 통계)
- **다중 통계 계산**: min/max/sum/count 등 여러 지표는 한 번의 루프로 함께 계산 (여러 `reduce`/`filter` 체이닝 대신)

## 집충전기 카드 상수화 기준

큰 컴포넌트의 파일 분할 참고 (`HomeChargerCard.js`):

| 파일 | 담당 |
|------|------|
| `home-charger/constants.js` | 상수: ID 매핑, 스테이션/동 배치, 상태 메타, 주기값 |
| `home-charger/utils.js` | 순수 함수: 랭크 계산, 시간 포맷, 툴팁 빌더 |
| `home-charger/ChargerTile.js` | UI 프리미티브: `UnifiedCell`, `TileBox`, `StatusBadges`, `MiniGrid` |
| `HomeChargerCard.js` | 상태 관리 + 레이아웃 조립 |

**원칙**:
- 하드코딩된 문자열/숫자 → 상수화 (예: `'PI795111'` → `MAIN_STATION_ID`)
- 2회 이상 반복되는 JSX 블록 → 공용 컴포넌트로 추출
- 유사한 prop 묶음 → spread 객체 (`tileProps`)로 통합

## 개발 모드

- Mock 시스템 (`app/context/mock.js`) — 개발 환경에서 "가상" 버튼으로 DB 없이 테스트
- `NODE_ENV !== 'production'`일 때만 Mock 토글 버튼 표시

## 커밋 스타일

```
<type>: <한글 또는 영문 설명>
```

타입: `feat`, `fix`, `refactor`, `tune`, `ci`, `docs`, `chore`
