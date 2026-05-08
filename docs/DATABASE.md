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
