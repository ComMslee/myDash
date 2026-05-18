# TeslaMate Custom Dashboard

TeslaMate 위에 올린 Next.js 14 커스텀 대시보드. 주행·배터리·충전·집충전기 현황을 한국어 모바일 UI로 제공한다.

## 페이지 (하단 4탭 + 부속)

- **주행 (`/v2/drives`)** — 차량 KPI · 인사이트 · 시간×요일 패턴 · TOP50 · 연도별 월간/계절 효율 (`/` → 리다이렉트)
- **이력 (`/v2/history`)** — 일 카드 리스트 → 일 상세 지도 / 월 합계 / 자주 가는 곳·오래 머문 곳 토글
- **배터리 (`/v2/battery`)** — 건강 점수 · 대기 소모 24h 타임라인 · 충전 습관 · 월간/히트맵 · 급속·완속 기록
- **충전소 (`/v2/chargers`)** — 집충전기 실시간(환경공단 API) + Top 순위 + 활용도 리포트 (인라인)
- **자동화 (`/v2/schedule`)** — 센트리/공조 스케줄 · 즉시 실행 · 월 캘린더 · 실행 로그 · Tesla Fleet API 사용량/비용 (설정 시트 진입)
- 부속: `/v2/chargers/report` (활용도 단독 페이지) · `/v2/tg` (텔레그램 봇 관리) · `/v2/dev/api-status` (라우트 헬스 + 진단) · `/v2/dev/auth` (PIN 변경)

## 빠른 시작

`.env` 생성 후 docker compose 실행:

```env
TM_DB_USER=teslamate
TM_DB_PASS=<password>
TM_DB_NAME=teslamate
ENCRYPTION_KEY=<openssl rand -hex 32>
# 선택 — 없으면 일부 기능 비활성
KAKAO_REST_API_KEY=...
EV_CHARGER_API_KEY=...
HOME_CHARGER_STAT_ID=<CHARGER_STAT_ID>   # 환경공단 충전소 통계 ID
```

```bash
docker compose up -d
```

TeslaMate 초기 연동은 `http://localhost:4000` → Tesla 계정 로그인.

## 배포

`master` push 시 GitHub Actions (GitHub-hosted `ubuntu-latest`)가 Lightsail로 SSH 접속해 자동 배포한다. 자세한 내용은 [`docs/DEPLOY.md`](./docs/DEPLOY.md).

## 기술 스택

Next.js 14 · JavaScript(ESM) · Tailwind 3 · PostgreSQL 16(TeslaMate 스키마, `pg` 직접 쿼리) · Leaflet 1.9 · Docker(node:20-alpine) · AWS Lightsail

## 아키텍처

```
                       외부 API (HTTPS, outbound)
           Tesla Fleet · 환경공단 EV · Kakao · TourAPI · 기상청
                          ▲           ▲
                          │ OAuth2    │ REST
                          │ + 명령    │
   브라우저 ─HTTPS─┐       │           │            ┌─ 텔레그램
                  ▼       │           │            ▼
   GitHub ─push/SSH─►   AWS Lightsail (Seoul · 1GB micro)
                  ┌──────────────────────────────────────────┐
                  │  Caddy  :80/:443  (forward_auth · HSTS)  │
                  │    ├─► dashboard:5000 (Next.js · API)    │
                  │    │      ├─ /api/*           ─► Postgres│
                  │    │      ├─ /api/tesla/*     ─► Fleet ⚡│
                  │    │      └─ schedule-runner  ─► Fleet ⚡│
                  │    └─► teslamate:4000 (보호 UI)          │
                  │                                          │
                  │  telegram-hub ──/api/*──► dashboard      │
                  │  teslamate    ─MQTT────► Postgres        │
                  └──────────────────────────────────────────┘
```

**Tesla Fleet API (⚡)**: dashboard 가 HTTPS 로 직접 호출 — OAuth2 토큰(자동 refresh) + commands/vehicle_data/wakes. **유료 호출**이므로 `/v2/schedule` 자동화 + 즉시 실행 패널에서만 사용 (단가는 [`CLAUDE.md`](./CLAUDE.md#%F0%9F%9A%A8-tesla-fleet-api--%ED%98%B8%EC%B6%9C-%EB%B2%94%EC%9C%84%EB%B9%84%EC%9A%A9-%EC%A4%91%EC%9A%94) 참조). 그 외 페이지는 TeslaMate DB 직접 조회(무료).

**데이터 경로 원칙**: UI·봇 등 모든 소비자는 `dashboard /api/*` 만 호출. 외부 DB 직접 접근 금지 — 비즈니스 로직(폴백 감지, 스키마 함정 회피)이 한 곳에 모인다. 신규 봇 명령 추가 시 필요한 API 가 없으면 **먼저 만들고** 호출.

**캐시 3단**:
1. 메모리 TTL (`server-cache`) — 라우트별 15s~600s
2. DB 사전 집계 (`dash_*`) — 매일 04:00 KST 갱신
3. DB 영구 (`kakao_address_cache` 등) — 외부 API 결과 보존

## 문서

- 개발 규칙/구조 — [`CLAUDE.md`](./CLAUDE.md)
- 인프라·운영 — [`docs/`](./docs/README.md) (접속/배포/운영/백업/트러블슈팅/Tailscale/공공 API)
