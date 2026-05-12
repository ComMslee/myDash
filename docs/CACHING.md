# 캐싱 & 데이터 흐름

대시보드의 fetch ↔ DB 흐름과 각 단계 캐시 위치/TTL/무효화 정책.

## 전체 흐름

```
브라우저 ─fetch→ Next.js API 라우트 ─pg query→ TeslaMate Postgres
                       │
                       ├─ Kakao 역지오코딩 ───→ kakao_address_cache (DB · 30일 TTL)
                       │                       └ miss → Kakao Local API
                       │
                       ├─ route-map 모듈 LRU (200, 휘발)
                       │   └ miss → SELECT positions WHERE drive_id
                       │
                       └─ 집충전기 캐시 ──────→ home_charger_snapshot (DB · 콜드 복원)
                                              ├ inflight dedup
                                              └ TTL 만료 → 환경공단 EvCharger API
```

서버 재시작 시 휘발성 캐시(route-map LRU, home-charger 메모리 cache 등)는 비워지고, DB 캐시 두 종(kakao, home_charger_snapshot)은 보존된다.

## 서버 사이드 캐시

### 1. Kakao 역지오코딩 — DB 영구 캐시
- **위치**: `dashboard/lib/kakao-geo.js`
- **저장**: `kakao_address_cache(coord_key TEXT PK, label TEXT, updated_at TIMESTAMPTZ)`
- **키**: `${lat.toFixed(4)},${lng.toFixed(4)}` (~11m 정밀도)
- **TTL**: 30일 — 만료되면 API 재조회 후 갱신, API 실패 시 기존 라벨 유지
- **스키마 버전**: `v2_poi` (`kakao_cache_meta` 마커). 코드 측 버전 변경 시 TRUNCATE
- **호출처**: `/api/drives` 가 200건 drives의 시작/끝 좌표를 `batchReverseGeocode(coords, concurrency=5)` 로 처리
- **무효화**: 자동(30일 TTL), 수동 시 `TRUNCATE kakao_address_cache` + `kakao_cache_meta` 버전 마커 갱신

### 2. route-map 모듈 LRU 캐시
- **위치**: `dashboard/app/api/route-map/route.js` (모듈 스코프 `Map`)
- **용량**: 200 entries (insertion-order LRU. get 시 delete→set 으로 promote)
- **키**: `${driveId}|${detail}` (`detail`은 `full` | `light`)
- **TTL**: 없음 — drive 종료 후 positions가 불변이라 안전. 서버 재시작 시 휘발
- **예외**: `driveId` 미지정(latest drive 자동 선택) 케이스는 캐시하지 않음
- **무효화**: 서버 재시작 (Postgres에서 positions를 사후 변경하지 않는다는 가정)

### 3. 분석 라우트 메모리 TTL 캐시 (server-cache)
- **위치**: `dashboard/lib/server-cache.js` (모듈 스코프 Map + inflight dedup)
- **적용 라우트**:
  - `/api/insights` (600s · Tier 2 위임), `/api/charge-all-time` (600s · Tier 2 위임)
  - `/api/battery-trend` (600s)
  - `/api/monthly-history` (300s · Tier 2 위임), `/api/rankings` (300s · Tier 2 위임, key 에 type·limit 포함)
  - `/api/heatmap` (300s), `/api/frequent-places` (300s · Tier 2 위임), `/api/long-stay-places` (300s)
  - `/api/fast-charges` (180s), `/api/slow-charges` (180s), `/api/battery` (180s)
  - `/api/summary` (120s · Tier 2 위임, `range=multi` 및 fully-historical 범위만)
- **키**: `${route}:${carId}[:${queryParams}]`
- **무효화**: TTL 만료, `?refresh=1`, 또는 `/api/admin/refresh-aggs` 성공 시 사전집계 의존 프리픽스 일괄 invalidate (`insights:` / `charge-all-time:` / `monthly-history:` / `summary:` / `rankings:` / `frequent-places:`)
- **재시작 시 휘발**: 컨테이너 재시작 = 자연 무효화
- **inflight dedup**: 만료 직후 동시 요청 → 1회만 DB 쿼리

### 4. 사전 집계 (dash_*) — TeslaMate DB 테이블 (Tier 2 풀)

- **위치**: `dashboard/lib/dash-agg.js` (TeslaMate DB 에 `dash_` prefix 테이블 보유, TeslaMate 스키마 자체는 무수정)
- **테이블**:
  - `dash_daily_drive_agg(car_id, day, dow, hour, ticks_10min, distance_km, duration_min, drive_count, used_km)` — PK `(car_id, day, hour)`
  - `dash_daily_charge_agg(car_id, day, dow, hour, ticks_10min, energy_kwh, charge_count, home_count, fast_count)` — PK `(car_id, day, hour)`
  - `dash_monthly_insights(car_id, year, month, distance_km, drive_count, duration_min, used_km, max_*, total_kwh, charge_count, avg_kwh, home/other/fast/slow_charges, best_long/eff_drive_*)` — PK `(car_id, year, month)`
  - `dash_top_drives_cache(car_id, metric, rank, drive_id, value, start_date)` — PK `(car_id, metric, rank)` — 8 메트릭 × TOP 50
  - `dash_place_clusters(car_id, bin_lat numeric(7,4), bin_lon numeric(7,4), visit_count, top_origin_lat, top_origin_lon, last_visited_at)` — PK `(car_id, bin_lat, bin_lon)` — drive 끝점 0.0005° (~55m) bin
  - `dash_place_geo(coord_key TEXT PK, label, updated_at)` — 클러스터 라벨 캐시 (kakao_address_cache 와 별개)
  - `day` 는 KST 날짜 (`start_date + INTERVAL '9 hours' :: date`).
- **갱신**: `POST /api/admin/refresh-aggs?scope=daily|monthly|top|places|all` (HUB_SHARED_SECRET) — 매일 KST 04:00 GHA cron (`.github/workflows/refresh-aggs.yml`). 최근 7일 daily upsert + monthly N개월(기본 24) + top 전체 truncate-replace + places 전체 재계산.
- **읽기 패턴**:
  - `/api/insights`: 11개 과거 월 = `dash_monthly_insights`, 현재 월 = 라이브 단일 쿼리. allTime = monthly SUM + 현재 월. hour×dow = 라이브 (`generate_series`).
  - `/api/charge-all-time`: 전체 = `dash_daily_charge_agg` SUM. hour×dow = `SUM(ticks_10min)`.
  - `/api/monthly-history`: 과거 월 = `dash_monthly_insights`, 현재 월 라이브. 계절 효율도 사전집계 + 현재 월.
  - `/api/rankings`: `dash_top_drives_cache` 에서 ID 추출 후 drives JOIN. day 메트릭은 캐시된 KST date 로 drives 그룹 재조회.
  - `/api/summary`: 과거 범위(yesterday/last-week/last-month/prev-rolling-4w/weekend) = `dash_daily_*_agg` SUM. 오늘 포함 범위는 라이브.
  - `/api/frequent-places`: `dash_place_clusters` TOP-N 후 라벨/지오펜스 메타는 라이브 보충 + `dash_place_geo` 캐시.
- **부트스트랩 (콜드)**: `ensureSchema()` 후 `bootstrapIfEmpty(carId)` — 디폴트 차량의 집계가 비어 있으면 전체 히스토리 백필 (컨테이너 라이프타임당 1회, inflight Promise dedup). 첫 요청 10–60초, 이후 빠름.
- **무효화**: refresh-aggs 성공 시 `server-cache` 의 `insights:` / `charge-all-time:` / `monthly-history:` / `summary:` / `rankings:` / `frequent-places:` 프리픽스 일괄 invalidate.

### 5. 집충전기 (환경공단 EvCharger) 캐시
- **위치**: `dashboard/lib/home-charger-cache.js` (코어) + `dashboard/lib/home-charger/{schema,poll-log,usage,fleet-stats}.js` (분리 모듈)
- **메모리 캐시**: 모듈 변수 `cache = { ts, data }`, `inflight` (동시 요청 dedup)
- **TTL (정적)**: KST 시간대별 5~12분 (`CACHE_TIERS`). 저녁 피크(18~22시) 5분, 오후 12분 등
- **TTL (동적, 옵션)**: `USE_DYNAMIC_TTL=true` 시 최근 90일 충전 패턴으로 24시간마다 학습 (현재 `false` 유지)
- **콜드 스타트 복원**: 서버 재시작 직후 `home_charger_snapshot` 테이블의 가장 최근 payload 로 메모리 캐시 워밍업
- **쿨다운**: 환경공단 일일 쿼터(1,000회) 보호 — 쿼터 초과 감지 시 `quotaCooldownUntil`, 일반 실패 시 `failureCooldownUntil` 10분
- **백그라운드 폴링**: `instrumentation.js`에서 워밍 업 (별도 번들이라 모듈 상태가 갈라지므로 `globalThis['__homeChargerDiag__']` 싱글톤으로 진단 카운터 공유)
- **부수 테이블**: `charger_usage` (statId×chgerId×hour 사용 카운트, 30분 쿨다운으로 중복 증가 차단). 스키마는 [`docs/DATABASE.md`](./DATABASE.md) 참조
- **무효화**: `?refresh=1` 강제 갱신 또는 TTL 만료

## 클라이언트 사이드

- 모듈 캐시 없음. 페이지 진입마다 fetch (현재 의식적인 정책)
- **요청 취소**: `useDriveData.js`에서 `AbortController` 로 selectedDrive·dayMode·monthMode 변경 시 직전 요청 취소
- **동시성 제한**: `fetchInChunks(items, fn, concurrency=6)` — dayRoutes/monthRoutes 다수 fetch가 브라우저 connection pool을 초과하지 않도록 6 워커로 직렬화
- **BottomNavV2 visibility-aware 폴링** — `/api/car`·`/api/charging-status` 30s 폴링과 1분 tick 모두 `document.hidden` 시 정지, 복귀 시 즉시 1회 fetch + 인터벌 재개 (불필요 백그라운드 요청 차단)

## 응답 페이로드 다운샘플

`/api/route-map?detail=light`
- 직전 보존 점에서 Haversine 거리 5m 이상인 점만 유지. 시작/끝점은 항상 보존
- `speedBands`·`maxSpeedKmh`는 다운샘플 전 전체 점 기준으로 계산되어 통계 정확도는 변하지 않음
- **사용처**: `useDriveData` monthMode (한 달 N건 routes를 동시 표시 — 폴리라인 비용↓)
- **미사용처**: 단일 drive(selectedDrive), dayMode (RouteSparklines 정밀도 보존)

## API 라우트 ↔ DB ↔ 외부 API ↔ 캐시 매핑

| 라우트 | 주 테이블 | 외부 호출 | 서버 캐시 |
|--------|----------|----------|----------|
| `/api/battery` | charging_processes, drives, positions, battery_health | — | server-cache 180s |
| `/api/battery-trend` | charging_processes, drives | — | server-cache 600s |
| `/api/drives` | drives, addresses, geofences, positions | Kakao Local | kakao_address_cache (30일) |
| `/api/route-map` | positions | — | 모듈 LRU (200, 휘발) |
| `/api/frequent-places` | dash_place_clusters + drives/addresses/geofences (메타) + dash_place_geo | Kakao Local | server-cache 300s + 클러스터/라벨 사전 집계 |
| `/api/charging-status` | car, charging_processes, positions | — | 없음 (라이브) |
| `/api/home-charger` | home_charger_snapshot | 환경공단 EvCharger | 모듈 메모리 + DB 스냅샷 |
| `/api/home-charger/fleet-stats` | charger_usage, home_charger_snapshot | — | 없음 |
| `/api/home-charger/groups` | charger_usage, home_charger_snapshot | — | 없음 (constants.js 매핑) |
| `/api/home-charger/report` | charger_usage, home_charger_snapshot | — | `getCache()` 의 모듈 캐시 활용 (콜드 스타트 시 DB observed_chargers 폴백) |
| `/api/home-charger/poll-log` | (메모리 진단) | — | 없음 |
| `/api/monthly-history` | dash_monthly_insights + drives (현재 월 라이브) | — | server-cache 300s + 월별 사전 집계 |
| `/api/charge-all-time` | dash_daily_charge_agg | — | server-cache 600s + 일별 사전 집계 |
| `/api/heatmap` | drives | — | server-cache 300s |
| `/api/insights` | dash_monthly_insights + drives (현재 월 + hour×dow + 베스트 드라이브 라이브) | — | server-cache 600s + 월별 사전 집계 |
| `/api/admin/refresh-aggs` | dash_daily_*, dash_monthly_insights, dash_top_drives_cache, dash_place_clusters (upsert / truncate-replace) | — | 없음 (POST · requireAuth, GHA cron 매일 04:00 KST, scope=all\|daily\|monthly\|top\|places) |
| `/api/admin/agg-status` | dash_daily_*, dash_monthly_insights, dash_top_drives_cache, dash_place_clusters, dash_place_geo (read-only) | — | 없음 (GET · requireAuth · `cacheStats()` 메모리 dump 포함 — `/v2/dev/api-status` 집계 탭이 사용) |
| `/api/rankings` | dash_top_drives_cache + drives (JOIN 메타) | Kakao Local | server-cache 300s (per type·limit) + TOP 50 사전 캐시 |
| `/api/fast-charges` | charging_processes | — | server-cache 180s |
| `/api/slow-charges` | charging_processes | — | server-cache 180s |
| `/api/find-nearby-chargers` | — | 환경공단 EvCharger | 없음 |
| `/api/car` | cars | — | 없음 |
| `/api/charges` | charging_processes, geofences | — | 없음 |
| `/api/summary` | drives, charging_processes, dash_daily_*_agg (과거 범위) | — | server-cache 120s (multi/historical 범위만) + 일별 사전 집계 |
| `/api/parked` | drives, states | — | 없음 (라이브 — 봇 `/where`) |
| `/api/location` | positions | — | 없음 (라이브 최신 좌표 — 봇 `/where`) |
| `/api/long-stay-places` | drives, addresses, geofences | — | server-cache 300s |
| `/api/family/festivals` | family_festivals | — | DB 자체가 캐시 (GHA cron 주 3회 갱신, stale 임계 4일) — [TOUR_API.md](./TOUR_API.md) |
| `/api/family/festivals/refresh` | family_festivals (upsert) | TourAPI searchFestival2 | 없음 (POST · HUB_SHARED_SECRET 인증) |

## 추후 개선 후보 (기능 영향 검토 필요)

- **Next.js `unstable_cache`**: 무거운 집계 라우트(monthly-history, charge-all-time, rankings, heatmap, insights) 60s 서버 캐시
- **클라이언트 모듈 캐시**: drives, frequent-places (60s TTL · mock toggle 시 invalidate · stale-while-revalidate)
- **BottomNavV2 단기 캐시**: car 5분, charging-status 15s + tab `visibilitychange` 폴링 정지 (현재는 30초 setInterval만)
- **Kakao 쿼리 batch SELECT**: `batchReverseGeocode`가 좌표별 SELECT 1회씩 → `coord_key IN (...)` 1회로 통합
- **DB 인덱스 점검**: `positions(drive_id, date)`, `drives(car_id, start_date DESC)` (TeslaMate 기본 스키마 확인 필요)
