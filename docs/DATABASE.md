# 데이터베이스 & 환경 변수

TeslaMate가 관리하는 PostgreSQL 16 스키마. 직접 쿼리만 사용 (ORM 없음).

## 주요 테이블

| 테이블 | 용도 |
|--------|------|
| `cars` | 차량 정보 (id, name) |
| `drives` | 주행 기록 (distance, duration_min, start/end_rated_range_km, speed_max) |
| `charging_processes` | 충전 기록 (charge_energy_added, cost, geofence_id) |
| `positions` | GPS 위치 + 배터리 레벨 |
| `states` | 차량 상태 (driving, parked, suspended, online) |
| `addresses` | 주소 정보 (name, road, display_name) |
| `geofences` | 지오펜스 (집충전 판별에 사용) |

## 대시보드가 생성하는 테이블

| 테이블 | 용도 | 생성 위치 |
|--------|------|-----------|
| `charger_usage` | 집충전기 시간×충전기 사용 카운트 `(stat_id, chger_id, hour)` · 컨테이너 재시작 간 보존(DROP 금지) · 30분당 최대 1회 증가(시간당 최대 1회) | `lib/home-charger/schema.js::ensureTable()` |
| `charger_usage_daily` | 집충전기 **일×시간×충전기** 사용 카운트 `(stat_id, chger_id, date, hour)` · 활용도 리포트의 일별/주별/월별 가동률 계산 소스 | `lib/home-charger/schema.js::ensureTable()` |
| `home_charger_snapshot` | 환경공단 API 응답 스냅샷 `(cache_key, payload JSONB, fetched_at)` · 컨테이너 재시작 직후 콜드 스타트 캐시 복원용 | `lib/home-charger/schema.js::ensureTable()` |
| `home_charger_poll_log` | 집충전기 폴링 시계열 `(date, hour, attempts, successes, partial, retries, retry_successes, quota_hits, manual_attempts, warm_calls)` · `/v2/dev/api-status` WarmDiagCard 의 폴링 진단 소스 | `lib/home-charger/schema.js::ensureTable()` |
| `server_health_log` | 서버 헬스 시계열 `(ts PK, host_cpu, host_mem_pct, host_mem_avail_pct, db_ms, tm_cpu, tm_mem_mb, dash_cpu, dash_mem_mb, disk_used_pct, swap_used_pct)` · 24h 피크/한산 추적용 · 5분 dedupe push (페이지 폴링 시 누적) | `app/api/server-status/route.js::ensureSchema()` |
| `kakao_address_cache` | 좌표 → 한글 주소 캐시 `(coord_key PK, label, updated_at)` · 30일 TTL · `/api/drives` batchReverseGeocode 가 사용 | `lib/kakao-geo.js` |
| `kakao_cache_meta` | Kakao 캐시 스키마 버전 마커 (`v2_poi`) · 코드 측 버전 변경 시 TRUNCATE 트리거 | `lib/kakao-geo.js` |
| `family_festivals` | TourAPI 축제 폴링 결과 `(id PK, title, start_date, end_date, addr, area_code, sigungu_code, lat, lng, image, thumbnail, tel, fetched_at)` · GHA cron(월·수·금 03:00 KST)이 `/api/family/festivals/refresh` 통해 upsert · GET 라우트는 SELECT 만 | `lib/queries/family-festivals.js::ensureSchema()` |
| `hub_user_groups` | 텔레그램 봇 사용자 그룹 정의 `(group_key PK, label, description, is_root)` · `/v2/tg` 권한관리 탭에서 CRUD | `lib/tg-user-groups.js` |
| `hub_user_group_features` | 사용자 그룹 ↔ 기능(카테고리) 매핑 `(group_key, feature)` · 가입 승인 시 `hub_permissions` 로 일괄 복사 | `lib/tg-user-groups.js` |
| `dash_daily_drive_agg` | 일·시간 단위 주행 사전 집계 `(car_id, day, dow, hour, ticks_10min, distance_km, duration_min, drive_count, used_km)` PK `(car_id, day, hour)` · `day` = KST 날짜 · `/api/summary` (historical) · `/api/insights` (hour×dow) 위임 소스 | `lib/dash-agg.js::ensureSchema()` |
| `dash_daily_charge_agg` | 일·시간 단위 충전 사전 집계 `(car_id, day, dow, hour, ticks_10min, energy_kwh, charge_count, home_count, fast_count)` PK `(car_id, day, hour)` · `/api/charge-all-time` (단독) · `/api/summary` (historical) 위임 소스 | `lib/dash-agg.js::ensureSchema()` |
| `dash_monthly_insights` | 월별 주행/충전 인사이트 사전 집계 (21컬럼: distance/duration/drive_count + max_*+ kwh + home/other/fast/slow_charges + best_long_drive_* + best_eff_drive_*) PK `(car_id, year, month)` · `/api/insights` (과거 11개월 + allTime SUM) · `/api/monthly-history` (24개월) 위임 소스 | `lib/dash-agg.js::ensureSchema()` |
| `dash_top_drives_cache` | 8 메트릭 × TOP 50 캐시 `(car_id, metric, rank, drive_id, value, start_date)` PK `(car_id, metric, rank)` · refresh 시 truncate-replace · `/api/rankings` 위임 소스 (drive_id 로 drives JOIN) | `lib/dash-agg.js::ensureSchema()` |
| `dash_place_clusters` | 주행 끝점 0.0005° (~55m) bin 클러스터 `(car_id, bin_lat numeric(7,4), bin_lon numeric(7,4), visit_count, top_origin_lat, top_origin_lon, last_visited_at)` PK `(car_id, bin_lat, bin_lon)` · `/api/frequent-places` TOP-N 위임 소스 | `lib/dash-agg.js::ensureSchema()` |
| `dash_place_geo` | 클러스터 좌표 → 한글 라벨 캐시 `(coord_key TEXT PK, label, updated_at)` · `kakao_address_cache` 와 별개로 클러스터 라벨 전용 | `lib/dash-agg.js::ensureSchema()` |
| `dash_schedules` | Tesla 자동화 스케줄 — `(id, name, enabled, mode, action, action_params jsonb, trigger_config jsonb, skip_dates jsonb, valid_from, valid_until, apply_pause_mode, wake_policy, last_run_*, next_run_at)` · 트리거 3축(시간/장소/날씨) 은 모두 `trigger_config` JSONB 안 · `wake_policy` = `'allow_wake'`(기본·자고 있어도 깨워서 실행, wake $0.02) / `'never_wake'`(TeslaMate `states` 로컬 조회 후 sleep 이면 silent skip, 비용 0) | `lib/queries/schedules.js::ensureSchema()` |
| `dash_schedule_executions` | 실행 이력 — `(id, schedule_id FK ON DELETE SET NULL, triggered_at, trigger_source, action, action_params jsonb, status, reason, api_calls jsonb, tesla_response jsonb, cost_estimate numeric)` · `/v2/schedule` 캘린더·이력 패널 소스 | `lib/queries/schedules.js::ensureSchema()` |
| `dash_schedule_daily_stats` | 스케줄별 일 집계 `(schedule_id FK, day, exec_count, success_count, fail_count, skip_count, cost_sum)` PK `(schedule_id, day)` | `lib/queries/schedules.js::ensureSchema()` |
| `dash_api_usage_monthly` | Tesla Fleet API 월별 누적 `(month PK, commands_count, wakes_count, vehicle_data_count, streaming_signals_count, estimated_cost)` · 단가는 `calcCost()` 단일 소스 ($10/월 무료 한도) | `lib/queries/schedules.js::ensureSchema()` |
| `dash_pause_periods` | 휴무 기간 `(id, from_date, until_date, reason)` · 기간 내 자동 실행 일괄 차단 (`apply_pause_mode` 가 true 인 스케줄 한정) | `lib/queries/schedules.js::ensureSchema()` |
| `dash_location_events` | 지오펜스 진입·이탈 이벤트 `(id, geofence_id, event_type, occurred_at, lat, lng)` · 워커가 INSERT (TeslaMate `geofences.id` 직접 참조, FK 없음) | `lib/queries/schedules.js::ensureSchema()` |

> 텔레그램 hub 가 자체 관리하는 `hub_users`, `hub_permissions`, `hub_unmatched_inputs`, `hub_categories` 는 `services/telegram-hub` 가 idempotent 로 생성한다 ([`telegram-bot/README.md`](./telegram-bot/README.md) 참조).

### `charger_usage` 스키마

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `stat_id` | `VARCHAR(20) NOT NULL` | 환경공단 스테이션 ID (PK) |
| `chger_id` | `VARCHAR(20) NOT NULL` | 충전기 ID (PK) |
| `hour` | `SMALLINT NOT NULL` | KST 0~23 (PK) |
| `count` | `INTEGER NOT NULL DEFAULT 0` | 누적 사용 횟수 |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | 마지막 증가 시각 (30분 쿨다운 판정용) |

### `home_charger_snapshot` 스키마

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `cache_key` | `VARCHAR(20) PRIMARY KEY` | 현재 `'main'` 단일 키 |
| `payload` | `JSONB NOT NULL` | API 응답 정규화 결과 |
| `fetched_at` | `TIMESTAMPTZ NOT NULL` | 원본 fetch 시각 |

## 환경 변수

| 변수 | 설명 |
|------|------|
| `TM_DB_USER` | PostgreSQL 사용자명 |
| `TM_DB_PASS` | PostgreSQL 비밀번호 |
| `TM_DB_NAME` | 데이터베이스 이름 (기본값: `teslamate`) |
| `DB_HOST` | DB 호스트 (기본값: `database`) |
| `ENCRYPTION_KEY` | TeslaMate 암호화 키 |
| `KAKAO_REST_API_KEY` | Kakao Local API 키 (역지오코딩). 없으면 DB 캐시만 사용 |
| `EV_CHARGER_API_KEY` | 공공데이터포털 환경공단 EvCharger 일반 인증키 (64-hex). 없으면 집충전기 카드 비표시 — [EV_CHARGER_API.md](./EV_CHARGER_API.md) |
| `HOME_CHARGER_STAT_ID` | 환경공단 단일 스테이션 ID (기본값: `PI795111`) |
| `HOME_CHARGER_STAT_IDS` | 환경공단 멀티 스테이션 ID (쉼표 구분, 예: `PI795111,PI313299,PIH01089`) |
| `KMA_API_KEY` | 기상청 단기예보 API 키 — 자동화 스케줄러 날씨 트리거에 사용 |
| `TESLA_FLEET_CLIENT_ID` / `_SECRET` | Tesla Developer 앱 OAuth 자격증명 (developer.tesla.com) |
| `TESLA_FLEET_API_ENABLED` | `true` 일 때만 실제 Fleet API 호출. 기본 `false` (dry_run) — **결제수단 미등록 권장: $10 무료 한도 초과 시 자동 차단** |

## 공용 상수 (`dashboard/lib/constants.js`)

| 상수 | 값 | 용도 |
|------|-----|------|
| `KWH_PER_KM` | 0.150 | rated range km → kWh 환산 (Model 3 기준) |
| `RATED_RANGE_MAX_KM` | 350 | 배터리 % 계산 기준 최대 주행거리 |

## 공용 유틸리티 (`dashboard/lib/format.js`)

| 함수 | 설명 |
|------|------|
| `formatDuration(min)` | 분 → "X시간 Y분" 또는 "Y분" |
| `formatHm(min)` | 분 → "Xh Ym" 또는 "—" (0/null) |
| `formatHours(hours)` | 시간(소수) → "Xh Ym" |
| `formatDate(iso)` | ISO → "M월 D일 HH:MM" |
| `shortAddr(addr)` | 주소의 첫 번째 쉼표 이전 부분만 반환 |
| `formatKorDate(iso)` | ISO → "YY/MM/DD" 또는 "MM/DD" (올해면 연도 생략) |
| `formatKorDateTime(iso)` | ISO → "YY/MM/DD HH:MM" (올해면 연도 생략) |
| `formatKorDay(day)` | "YYYY-MM-DD" → "M/D (요일)" |
| `formatMs(n)` | ms → "Xms" 또는 "X.Ys" (개발/진단 카드 공유) |
| `formatBytes(n)` | bytes → "XB"/"X.YK"/"X.YM" (server-cache 사이즈 등) |
| `formatRelativeTime(iso)` | ISO → "N초/분/시간/일 전" (사전집계 freshness 등) |

## KST 헬퍼 (`dashboard/lib/kst.js`)

`+ 9*60*60*1000` 매직 넘버 중복을 막기 위한 단일 소스. `toKstDate()`로 얻은 Date는 **UTC-getter (`getUTCHours` 등)로 KST 값을 반환** — `getHours()` 사용 금지.

| 상수/함수 | 설명 |
|-----------|------|
| `KST_OFFSET_MS` | `9 * 60 * 60 * 1000` |
| `toKstDate(input)` | UTC Date/ISO/ms → KST로 시프트된 Date |
| `kstDateStr(input, offsetDays=0)` | KST 기준 `'YYYY-MM-DD'` (일 단위 오프셋 가능) |
| `kstMondayStr(input)` | KST 기준 해당 주 월요일 `'YYYY-MM-DD'` (ISO 8601, 월~일) |
| `kstDayOfWeek(input=Date.now())` | KST 기준 요일 (0=일 … 6=토) |
| `formatHM(input)` | KST `'HH:MM'` |
| `formatTimeRange(start, end)` | `'M/D HH:MM~HH:MM'` (end 없으면 `'M/D HH:MM'`) |
| `splitByKstMidnight(startMs, endMs)` | UTC ms 범위를 KST 자정 기준으로 세그먼트 분할 (제너레이터) |
