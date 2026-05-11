# TeslaMate Custom Dashboard

TeslaMate 위에 올린 Next.js 14 커스텀 대시보드. 주행·배터리·충전·집충전기 현황을 한국어 모바일 UI로 제공한다.

## 페이지 (하단 4탭 + 부속)

- **주행 (`/v2/drives`)** — 차량 KPI · 인사이트 · 연간 히트맵 · TOP50 · 연도별 월간/계절 효율 (`/` → 리다이렉트)
- **이력 (`/v2/history`)** — 일 카드 리스트 → 일 상세 지도 / 월 합계 / 자주 가는 곳·오래 머문 곳 토글
- **배터리 (`/v2/battery`)** — 건강 점수 · 대기 소모 24h 타임라인 · 충전 습관 · 월간/히트맵 · 급속·완속 기록
- **충전소 (`/v2/chargers`)** — 집충전기 실시간(환경공단 API) + Top 순위 + 활용도 리포트 (인라인)
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
HOME_CHARGER_STAT_ID=PI795111
```

```bash
docker compose up -d
```

TeslaMate 초기 연동은 `http://localhost:4000` → Tesla 계정 로그인.

## 배포

`master` push 시 GitHub Actions (GitHub-hosted `ubuntu-latest`)가 Lightsail로 SSH 접속해 자동 배포한다. 자세한 내용은 [`docs/DEPLOY.md`](./docs/DEPLOY.md).

## 기술 스택

Next.js 14 · JavaScript(ESM) · Tailwind 3 · PostgreSQL 16(TeslaMate 스키마, `pg` 직접 쿼리) · Leaflet 1.9 · Docker(node:20-alpine) · AWS Lightsail

## 문서

- 개발 규칙/구조 — [`CLAUDE.md`](./CLAUDE.md)
- 인프라·운영 — [`docs/`](./docs/README.md) (접속/배포/운영/백업/트러블슈팅/Tailscale/공공 API)
