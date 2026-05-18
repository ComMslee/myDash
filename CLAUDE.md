# TeslaMate Custom Dashboard

TeslaMate PostgreSQL 데이터를 시각화하는 Next.js 14 기반 모바일 우선 대시보드. 가족 텔레그램 봇용 API gateway 역할 겸함 — `/api/family/*`, `/api/sns/*` 가 차량 외 외부 API(축제·SNS 등) 래핑/저장 단일 진실원.

## 기술 스택

- **프레임워크**: Next.js 14 (App Router) — 컨테이너 `5000:5000` (호스트 `127.0.0.1` 만 바인딩, 외부 접근은 Caddy 경유). 외부 `:80/:443` 은 Caddy(`teslamate-auth`) 가 dashboard:5000 으로 프록시
- **언어**: JavaScript (ESM, `"type": "module"`)
- **스타일링**: Tailwind CSS 3 — 인라인 유틸리티 클래스
- **DB**: PostgreSQL 16 (TeslaMate 스키마) — `pg` 라이브러리 직접 쿼리
- **지도**: Leaflet 1.9 (CDN 동적 로드, CartoDB Dark 타일)
- **컨테이너**: Docker (node:20-alpine)
- **CI/CD**: GitHub Actions → Lightsail SSH → docker compose

## 배포

`master` 브랜치 push 시 GitHub Actions(GitHub-hosted `ubuntu-latest` → Lightsail SSH)가 자동 배포한다 (`.github/workflows/deploy.yml`). **코드 수정 후 항상 즉시 서버 반영**되므로 별도 빌드/배포 명령은 실행하지 않는다.

사용자가 명시적으로 요청할 때만 로컬 빌드:

```bash
docker compose build dashboard && docker compose up -d dashboard
```

## 상세 문서

코드/스키마 핵심:
- [`docs/PROJECT_STRUCTURE.md`](./docs/PROJECT_STRUCTURE.md) — 파일 트리 + 페이지(4탭)
- [`docs/DATABASE.md`](./docs/DATABASE.md) — PostgreSQL 테이블 · 환경 변수 · 공용 상수/유틸
- [`docs/CACHING.md`](./docs/CACHING.md) — DB·캐시 흐름도 · API↔테이블↔캐시 매핑
- [`docs/CODE_CONVENTIONS.md`](./docs/CODE_CONVENTIONS.md) — UI/데이터/컴포넌트 규칙 · 커밋 스타일
- [`docs/PITFALLS.md`](./docs/PITFALLS.md) — 알려진 함정 11건 (수정 전 필독)

운영·외부 API 등 전체 인덱스: [`docs/README.md`](./docs/README.md)

## 핵심 규칙 요약

- **한국어 UI** (모든 레이블/에러/단위)
- **다크 테마**: 배경 `#0f0f0f`, 카드 `#161618`
- **모바일 우선**: `max-w-2xl mx-auto` + 하단 탭
- **KST(UTC+9)** 기준 시간 처리
- API 라우트: `export const dynamic = 'force-dynamic'`
- 단일 차량 가정: `SELECT id FROM cars LIMIT 1`
- 커밋: `<type>: <설명>` (`feat`, `fix`, `refactor`, `tune`, `ci`, `docs`, `chore`)
- **함정 표시 파일 수정 전**: 파일 상단에 `⚠️  수정 전 필독: /docs/PITFALLS.md "..."` 주석이 있으면 [`docs/PITFALLS.md`](./docs/PITFALLS.md) 의 해당 항목을 먼저 읽고 작업.
- **🚨 Tesla Fleet API 호출 범위 (중요)**: Tesla Fleet API (`lib/tesla-fleet.js` · `/api/tesla/*` · `/api/tesla-test/*` · `/api/now-command` · `lib/schedule-runner.js`) 는 **오직 자동화 페이지 (`/v2/schedule`) 에서만** 사용. 호출 1회당 실제 청구 발생 (commands $0.001 / vehicle_data $0.002 / wakes $0.02). **다른 페이지·기능·API 라우트에서 Tesla Fleet API 호출이 필요해 보이면 반드시 사용자 컨펌 받고 진행** — 자동 추가 금지. TeslaMate DB(PostgreSQL) 직접 쿼리는 무료/무제한이므로 가능하면 그쪽으로 우회.
- **Tesla 자동화 (`/v2/schedule`)**: 실제 Fleet API 호출은 `TESLA_FLEET_API_ENABLED=true` 일 때만(기본 dry_run). **결제수단 미등록 권장** — $10 무료 한도 초과 시 자동 차단(청구 X). 단가는 `lib/queries/schedules.js::COST` 단일 소스 — 모든 호출은 `lib/tesla-fleet.js::teslaFetch` 가 path 분류로 자동 카운팅 (`dash_api_usage_monthly`). 지오펜스는 TeslaMate UI 단일 진실원, 대시보드는 read-only.

## 아키텍처 원칙 — 데이터 경로

**소비자(봇·UI)는 API 만 호출. 외부 데이터 소스(DB·외부 서비스) 직접 접근 금지.**

각 서비스가 자기 데이터의 단일 진실원이 되고, 소비자(텔레그램 봇, 대시보드 UI, 다른 대시보드 등) 는 API 만 호출:
- `dashboard ← TeslaMate DB` (대시보드 API 가 단독으로 책임)
- `telegram-hub → dashboard /api/*` (봇 명령 응답은 dashGet 호출 후 포맷만)
- `dashboard UI → dashboard /api/*` (이미 그렇게 됨)

**왜**:
- 비즈니스 로직 단일 진실원 (예: charging 폴백 감지, charges 컬럼 부재 함정)
- 스키마/컬럼 변경이 소비자 전체에 자동 전파
- 같은 데이터를 여러 소비자가 서로 다른 쿼리로 조회 → 결과 불일치 방지

**예외**:
- 서비스 자체 데이터 (예: hub 의 `hub_*` 테이블 — RBAC, 가입자, 학습 로그) 는 그 서비스가 직접 관리
- 변동 감지용 폴링 (예: hub 가 TeslaMate `charging_processes`/`drives` 5초 폴링) 은 직접 DB 가 효율적 — 알림 트리거 한정

**새 봇 명령/소비자 추가 시**: 필요한 dashboard API 가 없으면 **먼저 만들고**, 봇은 `dashGet()` 호출 → 응답 포맷만. DB 직접 쿼리 금지.

세부 규칙은 [`docs/CODE_CONVENTIONS.md`](./docs/CODE_CONVENTIONS.md) 참고.

## 디버깅

이슈 보고·회귀 검증·서버 헬스 확인은 **`/v2/dev/api-status` 부터** — 3탭(서버/API 테스트/집계). 37개 라우트 가용성 + 서버/충전/폴링 진단 + 사전집계 상태/scope별 수동 갱신 통합 뷰. 코드만 읽으면 안 보이는 라이브 상태(폴링 루프, DB freshness, 충전 감지 신호, dash_* 테이블 rows/freshness, server-cache 메모리) 한 화면.

- 증상별 1차 진단 매핑 + WarmDiagCard 와의 역할 분리: [`docs/TROUBLESHOOTING.md`](./docs/TROUBLESHOOTING.md#1차-진단--v2devapi-status)
- 새 API 라우트 추가 시 `dashboard/app/v2/dev/api-status/page.js` 의 `ROUTES` 배열에도 등록.

## 알려진 함정 (전문 [`docs/PITFALLS.md`](./docs/PITFALLS.md))

- DriveMap 첫 렌더 폴리라인 — 5종 fix 모두 상주 필요 (`DriveMap.js` + `useDriveData.js`)
- `/api/route-map` LRU 캐시 변수명 오타 → eviction 미작동 → 5xx
- TeslaMate `charges` 스키마 변동 — `charge_limit_soc`/`time_to_full_charge` 부재 (충전 중에만 깨짐)
- 프런트 `fetch().catch(() => null)` 가 500 무음 처리
- `pg` 응답 숫자 타입 (NUMERIC string) → `.toFixed` 흰 화면
- 배포 후 캐시 — 하드 리프레시 안내
- PostgreSQL `$N` placeholder 타입 추론 (42725) → 명시적 캐스트
- 봇/대시보드 "이번달" 라벨 vs 데이터 모순 → "최근 4주" 일관성
- `getCache()` server-side 시점 비어있음 → `Math.max(1, n)` 가드
