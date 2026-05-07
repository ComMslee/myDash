# myDash 운영 가이드

AWS Lightsail 기반 TeslaMate Dashboard 운영 문서.

## 인프라 요약

| 항목 | 값 |
|---|---|
| 호스팅 | AWS Lightsail `micro_3_0` (1GB RAM, 2 vCPU, 40GB SSD, 2TB 전송) |
| 리전 | `ap-northeast-2` (Seoul) |
| OS | Ubuntu 22.04 LTS |
| 인스턴스 이름 | `mydash-prod` |
| 정적 IP | `43.202.133.239` |
| AWS 계정 | `183088117326` (`liam-lee`) |
| IAM CLI 사용자 | `mydash-cli` (PowerUserAccess) |
| 자동 스냅샷 | 매일 19:00 KST |
| 예산 알림 | `mydash-monthly` $10/월 |
| 요금 | 첫 90일 무료 → 이후 $7/월 |

## 구성 서비스 (docker-compose)

| 서비스 | 포트 | 역할 |
|---|---|---|
| dashboard | 5000 | Next.js 대시보드 |
| teslamate | 4000 | 데이터 수집기 |
| database | 5432 (내부) | PostgreSQL 16 |
| mosquitto | 1883 | MQTT 브로커 |

## 문서 목차

- [ACCESS.md](./ACCESS.md) — SSH·CLI·웹 접속 방법
- [OPERATIONS.md](./OPERATIONS.md) — 배포, 모니터링, 재부팅, 문제 해결
- [TAILSCALE.md](./TAILSCALE.md) — Tailscale 설정 (외부 접근)
- [DEPLOY.md](./DEPLOY.md) — CI/CD (GitHub Actions)
