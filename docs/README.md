# myDash 운영 가이드

AWS Lightsail 기반 TeslaMate Dashboard 운영 문서.

## 인프라 요약

| 항목 | 값 |
|---|---|
| 호스팅 | AWS Lightsail `micro_3_0` (1GB RAM, 2 vCPU, 40GB SSD, 2TB 전송) |
| 리전 | `ap-northeast-2` (Seoul) |
| OS | Ubuntu 22.04 LTS |
| 인스턴스 이름 | `mydash-prod` |
| 정적 IP | `<LIGHTSAIL_IP>` |
| AWS 계정 | `<AWS_ACCOUNT_ID>` (`<AWS_PROFILE_NAME>`) |
| IAM CLI 사용자 | `mydash-cli` (PowerUserAccess) |
| 자동 스냅샷 | 매일 19:00 KST |
| 예산 알림 | `mydash-monthly` $10/월 |
| 요금 | 첫 90일 무료 → 이후 $7/월 |

## 구성 서비스 (docker-compose)

| 서비스 | 포트 | 역할 |
|---|---|---|
| dashboard | 80 | Next.js 대시보드 (`80:5000` 매핑, 부가 `5000:5000`도 열림) |
| teslamate | (내부) | 데이터 수집기 — 외부 노출 없음 |
| teslamate-auth | 4000 | nginx basic-auth 프록시 → teslamate |
| database | (내부) | PostgreSQL 16 |
| mosquitto | 1883 | MQTT 브로커 |

## 문서 목차

### 운영
- [ACCESS.md](./ACCESS.md) — SSH·CLI·웹 접속
- [DEPLOY.md](./DEPLOY.md) — CI/CD (GitHub Actions → Lightsail SSH)
- [OPERATIONS.md](./OPERATIONS.md) — 재부팅/서비스/모니터링/비용
- [BACKUP.md](./BACKUP.md) — 스냅샷·DB 백업·인스턴스 정리
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — OOM/디스크/빌드/배포 장애 대응
- [TAILSCALE.md](./TAILSCALE.md) — Tailscale 설정 (외부 접근)

### 코드/스키마
- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) — 파일 트리 + 페이지(4탭) 구성
- [DATABASE.md](./DATABASE.md) — PostgreSQL 테이블·환경 변수·공용 상수/유틸
- [CACHING.md](./CACHING.md) — DB·캐시 흐름도, 서버/클라 캐시 정책, API↔테이블↔캐시 매핑
- [CODE_CONVENTIONS.md](./CODE_CONVENTIONS.md) — UI/데이터/컴포넌트 규칙·파일 분할 기준·커밋 스타일
- [EV_CHARGER_API.md](./EV_CHARGER_API.md) — 한국환경공단 전기차 충전소 정보 API 사용 가이드
