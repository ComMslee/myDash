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
  - 집충전기 서버 캐시 TTL: 동적 3~30분 (최근 90일 충전 히스토리 기반 학습, 24시간마다 재계산)
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
- **fetch 정리**: `useEffect` 내 fetch는 `AbortController`로 언마운트/파라미터 변경 시 취소 (`setState`-after-unmount 경고 방지) — 예: `roadtrips/useDriveData.js`
- **비싼 계산**: 배열 flat/stats/패스 생성 등은 `useMemo`로 메모이즈 (예: `RouteSparklines.js`)

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
