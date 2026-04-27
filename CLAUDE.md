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

세부 규칙은 [`docs/CODE_CONVENTIONS.md`](./docs/CODE_CONVENTIONS.md) 참고.
