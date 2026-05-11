# 알려진 함정 (Pitfalls)

코드 수정 시 회귀를 유발하기 쉬운 항목 모음. 함정 표시 파일 상단의 `⚠️ 수정 전 필독: /docs/PITFALLS.md "..."` 주석이 가리키는 항목을 먼저 읽고 작업한다.

## 목차

1. [DriveMap 첫 렌더 폴리라인](#drivemap-첫-렌더-폴리라인) — 이력 탭 첫 클릭 시 폴리라인 누락 회귀
2. [`/api/route-map` LRU 캐시 변수명](#apiroute-map-lru-캐시-변수명) — eviction 미작동 시 unbounded 캐시
3. [TeslaMate `charges` 테이블 스키마 변동](#teslamate-charges-테이블-스키마-변동) — 충전 중에만 깨지는 500 함정
4. [프런트 `fetch().catch(() => null)` 가 500 무음 처리](#프런트-fetchcatch--null-가-500-무음-처리)
5. [`pg` 응답 숫자 타입](#pg-응답-숫자-타입) — `.toFixed is not a function` 흰 화면
6. [배포 후 캐시](#배포-후-캐시) — 브라우저/CDN 캐시
7. [PostgreSQL `$N` placeholder 타입 추론 (42725)](#postgresql-n-placeholder-타입-추론-42725)
8. [봇/대시보드 "이번달" 라벨 vs 데이터 모순](#봇대시보드-이번달-라벨-vs-데이터-모순)
9. [`getCache()` server-side 시점 비어있음](#getcache-server-side-시점-비어있음)

---

## DriveMap 첫 렌더 폴리라인

`dashboard/app/components/DriveMap.js` + `dashboard/app/v2/history/useDriveData.js`

이력 탭 첫 클릭 시 폴리라인이 안 그려지고 default(서울) view 에 고정되던 회귀. 다음 5가지 fix 가 **모두** 살아 있어야 재현 안 됨 — 하나라도 빠지면 회귀.

1. mount/visibility 두 useEffect 모두 `setTimeout(150ms) → invalidateSize() + drawContentRef.current?.()` 패턴 유지 (`7b56817`/`830910a`).
2. `[drawContent]` deps useEffect 도 `invalidateSize()` 선행 후 `drawContent()` 호출 — 데이터 도착 시점에 컨테이너 layout 미정착이면 fitBounds 가 0-size 기준으로 잘못 계산됨 (`3e23655`).
3. `fitBounds(bounds, { animate: false })` — animate(default true) 진행 중 setState 로 인해 cancel 되어 view 가 default 에 고정되던 race condition (`3e23655`). 단일 경로 / routes 다중 경로 두 분기 모두 적용.
4. `useDriveData` 의 단일 경로 fetch useEffect 에서 시작 시점에 `setPositions([])` / `setRouteData(null)` 호출 금지 — 새 데이터 도착 전 빈 배열 set 이 fitBounds 애니메이션과 race 를 만들어 view 가 어긋남 (`3e23655`).
5. `/api/route-map` 5xx 회복용 1회 retry — `fetch().then(r => r.json())` 만으로는 HTTP 5xx 가 reject 되지 않아 `data.positions || []` 가 빈 배열로 그대로 흘러감. `r.ok` 체크 후 throw → catch 에서 1회 재시도 (`9ea3ebb`).

## `/api/route-map` LRU 캐시 변수명

`cacheSet` 의 eviction 루프 조건은 반드시 `cache.size > CACHE_CAPACITY` — 변수명 오타 시 `Map.size > undefined === false` 라 eviction 미작동, unbounded 캐시 → 메모리 압박 → 5xx 유발 (`9ea3ebb`).

## TeslaMate `charges` 테이블 스키마 변동

이 인스턴스 TeslaMate 엔 `charge_limit_soc` (`bb46127`), `time_to_full_charge` (`eb142e4`) 컬럼이 없음. `/api/charging-status` SELECT 에서 제외하고 응답에서는 `null` 로 반환.

**증상이 까다로운 이유** — 충전 미진행 시엔 폴백 분기만 타서 안 터지다가, `charging_processes` 가 열리는 순간(=실제 충전 시작) active 분기 SELECT 가 `column does not exist` 500 으로 떨어지고 `BottomNavV2` 의 `.catch(() => null)` 이 에러를 삼켜 `charging=false` 로 보임 ("처음엔 됐는데 안 됨" 회귀 패턴). 즉 **충전 중일 때만 깨지므로 일반 동작 확인으론 안 잡힘**. `charges` 신규 컬럼 SELECT 추가 시 반드시 컬럼 존재 여부 확인. 디버그용 `/api/debug/charging` 엔드포인트로 raw 덤프 확인 가능.

## 프런트 `fetch().catch(() => null)` 가 500 무음 처리

`BottomNavV2` 의 `Promise.all([fetch('/api/...').then(r=>r.json()).catch(() => null), ...])` 패턴은 HTTP 500 을 reject 로 만들지 않으므로(`fetch` 는 4xx/5xx 도 resolve), 응답 JSON 파싱 단계에서나 catch 가 걸림 → 결과적으로 데이터 없음=정상 false 인지 백엔드 에러인지 구분 안 됨. 신규 백엔드 변경 후 "값이 안 뜸" 보고 받으면 **API 응답 status 부터 확인**. 가능하면 `r.ok` 체크 후 throw 하는 패턴(`/api/route-map` 케이스 `9ea3ebb`)을 쓰는 게 안전.

## `pg` 응답 숫자 타입

`pg` 라이브러리는 환경/타입에 따라 `real`/`numeric` 등을 string 으로 반환할 수 있음 (특히 NUMERIC). 프런트에서 `value.toFixed()` 같은 number 메서드를 바로 호출하면 `toFixed is not a function` 으로 클라이언트 사이드 예외 → 페이지 흰 화면 (`5b7ee79`). 새 DB 컬럼에서 가져온 숫자에 `.toFixed`/`.toLocaleString` 등 호출 전 `Number()` 또는 `+` 강제 변환 + `Number.isFinite` 가드 권장.

## 배포 후 캐시

GitHub Actions 배포가 완료돼도 브라우저/CDN 캐시 때문에 즉시 반영 안 될 수 있음. 사용자가 "안 됨" 보고 시 하드 리프레시(Ctrl+Shift+R) 확인을 먼저 안내.

## PostgreSQL `$N` placeholder 타입 추론 (42725)

`pg` 의 placeholder 는 `unknown` 타입으로 들어가 여러 항 곱셈/연산에서 매칭 실패 — `operator is not unique: unknown * unknown`. 예: `$1 * days * 48` 가 fail. 캐스트 명시: `$1::int * days * 48` 또는 `$1::float * $2::int * 2.0` (`134b94b`). 단일 항 비교는 보통 OK, 여러 항 산술이 위험.

## 봇/대시보드 "이번달" 라벨 vs 데이터 모순

캘린더 이번달(1일~말일) 사용 시 월초 며칠은 데이터 빈약 → 의미 없음. 봇 `/period` 와 dashboard `PeriodStats` 는 **"최근 4주(28일) 롤링" 데이터를 보여주되 라벨도 "최근 4주"** 로 (`9d25c5a`/`73fe0bb`). 라벨 "이번달" + 데이터 4주 롤링 조합은 사용자가 "이건 4월 거잖아=이전달이지" 로 인식해 모순. 라벨↔산식 일관성 필수.

## `getCache()` server-side 시점 비어있음

`dashboard/lib/home-charger-cache.js` 의 module-level cache 는 누군가 `/api/home-charger` 를 한 번이라도 호출해야 채워짐. report API 가 이걸 참조하면 첫 호출 시 `stations=[]` → `totalChargers=0` → 분모 0 → 결과 NaN/null. 방어: `Math.max(1, totalChargers)` + DB 의 `observed_chargers` 로 fallback (`134b94b`).
