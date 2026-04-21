# 코딩 규칙

## UI/UX

- **한국어 UI** — 모든 레이블, 에러 메시지, 단위 표시
- **다크 테마** — 배경 `#0f0f0f`, 카드 `#161618`, 중첩 카드 `#1a1a1c`, 테두리 `border-white/[0.06]`
- **모바일 우선** — `max-w-2xl mx-auto`, 하단 탭 네비게이션 (safe-area 대응)
- **색상 팔레트**:
  - 주행 = `blue-400`
  - 충전 = `green-400` / `emerald-400`
  - 효율 = `amber-400`
  - 에러 = `red-400` / `rose-400`
  - 랭크 강조 (자주 사용) = `amber-400` ring

## 데이터

- **KST(UTC+9)** 기준 날짜/시간 처리 — SQL에서 `+ INTERVAL '9 hours'` 또는 JS에서 수동 변환
- **API 라우트**: 모두 `export const dynamic = 'force-dynamic'` (SSR 캐시 비활성화)
- **단일 차량**: `SELECT id FROM cars LIMIT 1` 패턴으로 항상 첫 번째 차량만 조회
- **자동 갱신 주기**:
  - 홈/헤더: 30초 (setInterval)
  - 집충전기 클라이언트 폴링: 60초 (`POLL_INTERVAL_MS`)
  - 집충전기 서버 캐시 TTL: 동적 3~40분 (충전 패턴 학습)

## 컴포넌트

- `'use client'` 지시어 — 페이지/인터랙티브 컴포넌트에 사용 (서버 컴포넌트 구분)
- Tailwind 인라인 스타일 — 별도 CSS 파일 최소화
- `tabular-nums` — 숫자 표시에 고정 폭 숫자 사용
- 배치:
  - 전역 공유 유틸 → `dashboard/lib/`
  - 전역 공유 컴포넌트 → `dashboard/app/components/`
  - 페이지 전용 컴포넌트 → 해당 라우트 폴더
  - 복잡한 컴포넌트 내부 모듈 → 동명 서브폴더 (예: `HomeChargerCard.js` + `home-charger/`)

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
