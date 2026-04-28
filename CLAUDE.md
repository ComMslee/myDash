# TeslaMate Custom Dashboard

TeslaMate PostgreSQL 데이터를 시각화하는 Next.js 14 기반 모바일 우선 대시보드.

## 기술 스택

- **프레임워크**: Next.js 14 (App Router) — 호스트 포트 80 (컨테이너 5000)
- **언어**: JavaScript (ESM, `"type": "module"`)
- **스타일링**: Tailwind CSS 3 — 인라인 유틸리티 클래스
- **DB**: PostgreSQL 16 (TeslaMate 스키마) — `pg` 라이브러리 직접 쿼리
- **지도**: Leaflet 1.9 (CDN 동적 로드, CartoDB Dark 타일)
- **컨테이너**: Docker (node:20-alpine)
- **CI/CD**: GitHub Actions → self-hosted runner → docker compose

## 배포

`master` 브랜치 push 시 GitHub Actions(GitHub-hosted `ubuntu-latest` → Lightsail SSH)가 자동 배포한다 (`.github/workflows/deploy.yml`). **코드 수정 후 항상 즉시 서버 반영**되므로 별도 빌드/배포 명령은 실행하지 않는다.

사용자가 명시적으로 요청할 때만 로컬 빌드:

```bash
docker compose build dashboard && docker compose up -d dashboard
```

## 상세 문서 (`docs/`)

| 문서 | 내용 |
|------|------|
| [`docs/PROJECT_STRUCTURE.md`](./docs/PROJECT_STRUCTURE.md) | 전체 파일 트리 + 페이지(4탭) 구성 |
| [`docs/DATABASE.md`](./docs/DATABASE.md) | PostgreSQL 테이블 · 환경 변수 · 공용 상수/유틸 |
| [`docs/CACHING.md`](./docs/CACHING.md) | DB·캐시 흐름도 · 서버/클라 캐시 정책 · API↔테이블↔캐시 매핑 |
| [`docs/CODE_CONVENTIONS.md`](./docs/CODE_CONVENTIONS.md) | UI/데이터/컴포넌트 규칙 · 파일 분할 기준 · 커밋 스타일 |
| [`docs/EV_CHARGER_API.md`](./docs/EV_CHARGER_API.md) | 환경공단 전기차 충전소 API 사용법 |
| [`docs/DEPLOY.md`](./docs/DEPLOY.md) | CI/CD (GitHub Actions → Lightsail SSH) |
| [`docs/OPERATIONS.md`](./docs/OPERATIONS.md) | 재부팅/서비스/모니터링/비용 |
| [`docs/BACKUP.md`](./docs/BACKUP.md) | 스냅샷·DB 백업·인스턴스 정리 |
| [`docs/TROUBLESHOOTING.md`](./docs/TROUBLESHOOTING.md) | OOM/디스크/빌드/배포 장애 대응 |
| [`docs/ACCESS.md`](./docs/ACCESS.md) | SSH·CLI·웹 접속 |
| [`docs/TAILSCALE.md`](./docs/TAILSCALE.md) | Tailscale 설정 |

## 핵심 규칙 요약

- **한국어 UI** (모든 레이블/에러/단위)
- **다크 테마**: 배경 `#0f0f0f`, 카드 `#161618`
- **모바일 우선**: `max-w-2xl mx-auto` + 하단 탭
- **KST(UTC+9)** 기준 시간 처리
- API 라우트: `export const dynamic = 'force-dynamic'`
- 단일 차량 가정: `SELECT id FROM cars LIMIT 1`
- 커밋: `<type>: <설명>` (`feat`, `fix`, `refactor`, `tune`, `ci`, `docs`, `chore`)
- **함정 표시 파일 수정 전**: 파일 상단에 `⚠️  수정 전 필독: /CLAUDE.md "알려진 함정 …"` 주석이 있으면 아래 [알려진 함정](#알려진-함정) 섹션의 해당 항목을 먼저 읽고 작업.

세부 규칙은 [`docs/CODE_CONVENTIONS.md`](./docs/CODE_CONVENTIONS.md) 참고.

## 알려진 함정

- **DriveMap 첫 렌더 폴리라인** (`dashboard/app/components/DriveMap.js` + `dashboard/app/v2/history/useDriveData.js`): 이력 탭 첫 클릭 시 폴리라인이 안 그려지고 default(서울) view 에 고정되던 회귀. 다음 5가지 fix 가 **모두** 살아 있어야 재현 안 됨 — 하나라도 빠지면 회귀.
  1. mount/visibility 두 useEffect 모두 `setTimeout(150ms) → invalidateSize() + drawContentRef.current?.()` 패턴 유지 (`7b56817`/`830910a`).
  2. `[drawContent]` deps useEffect 도 `invalidateSize()` 선행 후 `drawContent()` 호출 — 데이터 도착 시점에 컨테이너 layout 미정착이면 fitBounds 가 0-size 기준으로 잘못 계산됨 (`3e23655`).
  3. `fitBounds(bounds, { animate: false })` — animate(default true) 진행 중 setState 로 인해 cancel 되어 view 가 default 에 고정되던 race condition (`3e23655`). 단일 경로 / routes 다중 경로 두 분기 모두 적용.
  4. `useDriveData`의 단일 경로 fetch useEffect 에서 시작 시점에 `setPositions([])` / `setRouteData(null)` 호출 금지 — 새 데이터 도착 전 빈 배열 set 이 fitBounds 애니메이션과 race 를 만들어 view 가 어긋남 (`3e23655`).
  5. `/api/route-map` 5xx 회복용 1회 retry — `fetch().then(r => r.json())` 만으로는 HTTP 5xx 가 reject 되지 않아 `data.positions || []` 가 빈 배열로 그대로 흘러감. `r.ok` 체크 후 throw → catch 에서 1회 재시도 (`9ea3ebb`).
- **`/api/route-map` LRU 캐시 변수명**: `cacheSet` 의 eviction 루프 조건은 반드시 `cache.size > CACHE_CAPACITY` — 변수명 오타시 `Map.size > undefined === false` 라 eviction 미작동, unbounded 캐시 → 메모리 압박 → 5xx 유발 (`9ea3ebb`).
- **TeslaMate `charges` 테이블 스키마 변동**: 이 인스턴스 TeslaMate 엔 `charge_limit_soc` (`bb46127`), `time_to_full_charge` (`eb142e4`) 컬럼이 없음. `/api/charging-status` SELECT 에서 제외하고 응답에서는 `null` 로 반환. **증상이 까다로운 이유** — 충전 미진행 시엔 폴백 분기만 타서 안 터지다가, `charging_processes` 가 열리는 순간(=실제 충전 시작) active 분기 SELECT 가 `column does not exist` 500 으로 떨어지고 `GlobalHeader` 의 `.catch(() => null)` 이 에러를 삼켜 `charging=false` 로 보임 ("처음엔 됐는데 안 됨" 회귀 패턴). 즉 **충전 중일 때만 깨지므로 일반 동작 확인으론 안 잡힘**. `charges` 신규 컬럼 SELECT 추가 시 반드시 컬럼 존재 여부 확인. 디버그용 `/api/debug/charging` 엔드포인트로 raw 덤프 확인 가능.
- **프런트 `fetch().catch(() => null)` 가 500 을 무음 처리**: `GlobalHeader` 의 `Promise.all([fetch('/api/...').catch(() => null), ...])` 패턴은 HTTP 500 을 reject 로 만들지 않으므로(`fetch` 는 4xx/5xx 도 resolve), 응답 JSON 파싱 단계에서나 catch 가 걸림 → 결과적으로 데이터 없음=정상 false 인지 백엔드 에러인지 구분 안 됨. 신규 백엔드 변경 후 "값이 안 뜸" 보고 받으면 **API 응답 status 부터 확인**. 가능하면 `r.ok` 체크 후 throw 하는 패턴(`/api/route-map` 케이스 `9ea3ebb`)을 쓰는 게 안전.
- **배포 후 캐시**: GitHub Actions 배포가 완료돼도 브라우저/CDN 캐시 때문에 즉시 반영 안 될 수 있음. 사용자가 "안 됨" 보고 시 하드 리프레시(Ctrl+Shift+R) 확인을 먼저 안내.
