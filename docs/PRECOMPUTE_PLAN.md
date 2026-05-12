# 미리 계산 (Precompute) 플랜

전체 히스토리 풀스캔이 일어나는 분석 라우트들을, **과거 = 불변 / 오늘 = 라이브** 로 쪼개 단계적으로 사전 계산한다.

## 1. 인벤토리 — 무거움/불변성 매트릭스

| 라우트 | 쿼리 본질 | 과거 불변? | 비용 | 현재 캐시 |
|---|---|---|---|---|
| `/api/insights` | 12개월 월별 + 시간×요일 + TOP 50 + 베스트 효율/거리 | ~99% | 매우 무거움 | 없음 |
| `/api/charge-all-time` | 전체 충전 집계 + 시간×요일 | ~99% | 무거움 | 없음 |
| `/api/monthly-history` | 12개월 주행/충전 + 연간 운행일수 + 계절 효율 | ~99% | 무거움 | 없음 |
| `/api/rankings` | 일별 TOP 50 (distance/duration/speed/eff) | ~99% | 무거움 | 없음 |
| `/api/heatmap` | 365일 활동 히트맵 (positions) | ~99% | 매우 무거움 | 없음 |
| `/api/frequent-places` | drives 종점 빈도 + 인근 지오펜스 | ~99% | 중간 | 없음 |
| `/api/long-stay-places` | LEAD 윈도우 dwell 누계 | ~99% | 중간 | 없음 |
| `/api/fast-charges` · `/api/slow-charges` | 충전 분류 목록 | ~99% | 중간 | 없음 |
| `/api/summary` (range=multi) | 봇 `/period` 범위 집계 | ~99% | 중간 | 없음 |
| `/api/battery-trend` | charging+drives 트렌드 | ~95% | 중간 | 없음 |
| `/api/drives` | 최근 200 + Kakao 역지오 | 50% | 무거움 | kakao_address_cache (DB) |
| `/api/charging-status` | 현재 충전 | 0% (live) | 가벼움 | — |
| `/api/parked`, `/api/location` | 현재 위치 | 0% | 가벼움 | — |

## 2. 3-티어 전략

### Tier 1 — TTL 메모리 캐시 (즉시, 비침투)
- `dashboard/lib/server-cache.js` 신설 — 모듈 스코프 `Map<key, {ts, data}>` + per-key TTL
- 사용 예: `withCache('insights', 60_000, async () => { /* 기존 핸들러 */ })`
- 대상 9개 라우트: insights, charge-all-time, monthly-history, rankings, heatmap, frequent-places, long-stay-places, fast-charges, slow-charges, summary (multi)
- TTL 가이드: 분석 라우트 60s~300s, 충전 관련 30s, drives 목록 30s
- 무효화: 자연 만료. 강제 `?refresh=1` 옵션 추가
- 영향: 코드 변경 ~1줄/라우트, 컨테이너 재시작 시 휘발 = 안전

### Tier 2 — PostgreSQL 일별 집계 테이블 (선택적, 진짜 무거운 곳)
TeslaMate DB 에 `dash_` prefix 테이블 추가 (TeslaMate 스키마 손대지 않음):

```sql
-- 일별 (KST) 주행 집계 — dow×hour×day 단위
CREATE TABLE dash_daily_drive_agg (
  car_id        smallint NOT NULL,
  day           date     NOT NULL,             -- KST 날짜
  dow           smallint NOT NULL,             -- 0~6
  hour          smallint NOT NULL,             -- 0~23
  ticks_10min   integer  NOT NULL DEFAULT 0,   -- 10분 wall-clock 점유 틱
  distance_km   real     NOT NULL DEFAULT 0,
  duration_min  integer  NOT NULL DEFAULT 0,
  drive_count   integer  NOT NULL DEFAULT 0,
  used_km       real     NOT NULL DEFAULT 0,   -- start_rated - end_rated
  PRIMARY KEY (car_id, day, hour)
);

-- 일별 충전 집계
CREATE TABLE dash_daily_charge_agg (
  car_id        smallint NOT NULL,
  day           date     NOT NULL,
  dow           smallint NOT NULL,
  hour          smallint NOT NULL,
  ticks_10min   integer  NOT NULL DEFAULT 0,
  energy_kwh    real     NOT NULL DEFAULT 0,
  charge_count  integer  NOT NULL DEFAULT 0,
  home_count    integer  NOT NULL DEFAULT 0,
  fast_count    integer  NOT NULL DEFAULT 0,
  PRIMARY KEY (car_id, day, hour)
);
```

**리프레시 메커니즘** — Lightsail crontab 또는 GHA scheduled workflow 가 `/api/admin/refresh-aggs?days=2` 호출 (HUB_SHARED_SECRET 인증). 매일 KST 04:00:
- 어제(또는 N일) 데이터 `INSERT ... ON CONFLICT DO UPDATE`
- 오늘은 항상 라이브 쿼리

**API 변경 패턴**:
```js
// 어제까지: 집계 테이블에서
const past = await pool.query(`SELECT ... FROM dash_daily_drive_agg WHERE day < CURRENT_DATE AND car_id=$1 ...`);
// 오늘: 기존 generate_series 쿼리, day=CURRENT_DATE 로 제한
const today = await pool.query(`SELECT ... FROM drives WHERE start_date >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Seoul') ...`);
// 머지
```

**적용 우선순위**: insights → charge-all-time → monthly-history. 나머지는 Tier 1 만으로 충분 가능성 큼.

### Tier 3 — 클라이언트 stale-while-revalidate (옵션)
- BottomNavV2: car 5분, charging-status 30s + `visibilitychange` 폴링 정지
- 페이지별: SWR 도입 검토 (현재는 raw fetch)

## 3. 실행 순서

### PR1 (Tier 1 일괄) — 이번 주
1. `lib/server-cache.js` 추가 (단일 파일, 의존성 없음)
2. 10개 라우트에 `withCache(...)` wrap
3. CACHING.md 갱신 (라우트 표에 TTL 컬럼 추가)
4. master push → 자동 배포 → 응답 시간 측정

### PR2 (Tier 2 핵심 3개) — 다음 주
1. `dash_daily_*` 마이그레이션 (`dashboard/db/migrations/` 신규)
2. `/api/admin/refresh-aggs` POST 라우트 (HUB_SHARED_SECRET)
3. cron 등록 (GHA scheduled — repo 의존성 0)
4. insights/charge-all-time/monthly-history 핸들러 = 과거(테이블) + 오늘(라이브) 머지
5. Tier 1 캐시 TTL 축소 (5min → 30s) — 데이터 신선도 vs 응답속도 균형

### PR3 (옵션) — 검증 후
- 나머지 라우트 Tier 2 확장 또는 Tier 3 클라이언트 캐시

## 4. 리스크 & 대응

| 리스크 | 영향 | 대응 |
|---|---|---|
| Tier 1 stale 응답 (60s) | 갓 끝난 주행이 1분 안 보임 | `?refresh=1` 강제 갱신 옵션, `WarmDiagCard` 에 캐시 상태 표시 |
| Tier 2 집계 누락 (cron 실패) | 어제 데이터 빠짐 | `/v2/dev/api-status` 에 마지막 집계 시각 표시 + 단순 self-heal: `days=7` 항상 upsert (멱등) |
| TeslaMate 스키마 변경 | `start_rated_range_km` 등 컬럼 부재 | PITFALLS.md 함정 9건 패턴 — refresh 핸들러 안에 `IF column exists` 가드 |
| dash_ 테이블이 TeslaMate 백업·복원에 섞임 | 운영 부담 | 명시적 prefix `dash_` 로 자체 마이그레이션 폴더 분리, README 명시 |

## 5. 측정 지표

- **응답 시간 (p50/p95)**: 적용 전후 비교 (`/v2/dev/api-status` 의 latency 컬럼)
- **DB CPU**: Lightsail RDS 메트릭
- **stale 빈도**: Tier 1 hit/miss 카운터 노출
