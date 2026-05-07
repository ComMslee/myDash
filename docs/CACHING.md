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

### 3. 집충전기 (환경공단 EvCharger) 캐시
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

## 응답 페이로드 다운샘플

`/api/route-map?detail=light`
- 직전 보존 점에서 Haversine 거리 5m 이상인 점만 유지. 시작/끝점은 항상 보존
- `speedBands`·`maxSpeedKmh`는 다운샘플 전 전체 점 기준으로 계산되어 통계 정확도는 변하지 않음
- **사용처**: `useDriveData` monthMode (한 달 N건 routes를 동시 표시 — 폴리라인 비용↓)
- **미사용처**: 단일 drive(selectedDrive), dayMode (RouteSparklines 정밀도 보존)

## API 라우트 ↔ DB ↔ 외부 API ↔ 캐시 매핑

| 라우트 | 주 테이블 | 외부 호출 | 서버 캐시 |
|--------|----------|----------|----------|
| `/api/battery` | charging_processes, drives, positions, battery_health | — | 없음 |
| `/api/battery-trend` | charging_processes, drives | — | 없음 |
| `/api/drives` | drives, addresses, geofences, positions | Kakao Local | kakao_address_cache (30일) |
| `/api/route-map` | positions | — | 모듈 LRU (200, 휘발) |
| `/api/frequent-places` | drives, addresses, geofences | — | 없음 |
| `/api/charging-status` | car, charging_processes, positions | — | 없음 (라이브) |
| `/api/home-charger` | home_charger_snapshot | 환경공단 EvCharger | 모듈 메모리 + DB 스냅샷 |
| `/api/home-charger/fleet-stats` | charger_usage, home_charger_snapshot | — | 없음 |
| `/api/home-charger/poll-log` | (메모리 진단) | — | 없음 |
| `/api/year-heatmap` | charging_processes | — | 없음 |
| `/api/monthly-history` | charging_processes | — | 없음 |
| `/api/charge-all-time` | charging_processes | — | 없음 |
| `/api/heatmap` | drives | — | 없음 |
| `/api/insights` | drives | — | 없음 |
| `/api/rankings` | drives | — | 없음 |
| `/api/fast-charges` | charging_processes | — | 없음 |
| `/api/slow-charges` | charging_processes | — | 없음 |
| `/api/find-nearby-chargers` | — | 환경공단 EvCharger | 없음 |
| `/api/car` | cars | — | 없음 |

## 추후 개선 후보 (기능 영향 검토 필요)

- **Next.js `unstable_cache`**: 무거운 집계 라우트(year-heatmap, monthly-history, charge-all-time, rankings, heatmap, insights) 60s 서버 캐시
- **클라이언트 모듈 캐시**: drives, frequent-places (60s TTL · mock toggle 시 invalidate · stale-while-revalidate)
- **GlobalHeader 단기 캐시**: car 5분, charging-status 15s + tab `visibilitychange` 폴링 정지
- **Kakao 쿼리 batch SELECT**: `batchReverseGeocode`가 좌표별 SELECT 1회씩 → `coord_key IN (...)` 1회로 통합
- **DB 인덱스 점검**: `positions(drive_id, date)`, `drives(car_id, start_date DESC)` (TeslaMate 기본 스키마 확인 필요)
