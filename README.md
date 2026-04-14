# TeslaMate Custom Dashboard

TeslaMate 위에 올린 커스텀 Next.js 대시보드. 주행 기록, 배터리 현황, 월별 통계를 한국어 UI로 제공합니다.

## 구성

| 서비스 | 포트 | 설명 |
|--------|------|------|
| TeslaMate | 4000 | 차량 데이터 수집기 |
| PostgreSQL 16 | — | 데이터 저장소 |
| Mosquitto | 1883 | MQTT 브로커 |
| Dashboard | 5000 | 커스텀 Next.js 대시보드 |

## 대시보드 페이지

- **홈** — 오늘 주행 요약, 현재 상태
- **배터리** — 충전 현황, 효율, 배터리 소모 추이
- **주행** — 주행 기록 목록
- **월별** — 월별 주행·충전 통계

## 초기 설정

### 1. 환경 변수

`.env` 파일을 프로젝트 루트에 생성합니다:

```env
TM_DB_USER=teslamate
TM_DB_PASS=your_password
TM_DB_NAME=teslamate
ENCRYPTION_KEY=your_encryption_key
```

암호화 키 생성:
```bash
openssl rand -hex 32
```

### 2. 실행

```bash
docker compose -p teslamate up -d
```

### 3. TeslaMate 설정

브라우저에서 `http://localhost:4000` 접속 후 Tesla 계정 연동.

## 재부팅 자동 시작

모든 서비스는 `restart: always` 설정으로 Docker 재시작 시 자동 복구됩니다.

| 항목 | 방식 |
|------|------|
| Docker Desktop | Windows 레지스트리 Run 키 (자동 설치됨) |
| TeslaMate / DB / Mosquitto / Dashboard | `restart: always` |
| Tailscale VPN | Windows 서비스 (자동 시작) |
| GitHub Actions Runner | Windows 레지스트리 Run 키 |

## CI/CD (GitHub Actions)

`master` 브랜치에 push하면 자동으로 대시보드를 빌드·재시작합니다.

```
git push → GitHub Actions → self-hosted runner → docker compose build & up
```

### Self-hosted Runner 설정 (Windows)

1. `C:\actions-runner`에 runner 설치 및 설정
2. 로그인 시 자동 시작 (레지스트리 Run 키):
   ```
   HKCU\Software\Microsoft\Windows\CurrentVersion\Run
   GitHubActionsRunner = powershell.exe -WindowStyle Hidden ...
   ```

### GitHub Secrets 설정

| Secret | 내용 |
|--------|------|
| `TM_DB_USER` | DB 사용자명 |
| `TM_DB_PASS` | DB 비밀번호 |
| `TM_DB_NAME` | DB 이름 |
| `ENCRYPTION_KEY` | TeslaMate 암호화 키 |

## 대시보드 수동 배포

```bash
docker compose -p teslamate build dashboard && docker compose -p teslamate up -d dashboard
```

## 기술 스택

- **프레임워크**: Next.js 14 (App Router)
- **DB 연결**: `pg` (PostgreSQL 직접 쿼리)
- **UI**: 다크 테마, 모바일 우선, 한국어
- **컨테이너**: Docker Compose
