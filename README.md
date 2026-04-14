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

### 홈 (`/`)
- 최근 주행 통계 (오늘/이번주/저번주/이번달) + 최근 3건 리스트
- 최근 6개월 통합 — 주행 통계, 최고 기록, 월별 미니 바 차트
- 충전 요약 — 집/외부, 완속/급속 비율 바
- 시간대/요일별 주행·충전 패턴 히트맵

### 주행 (`/drives`)
- **목록 모드** — 날짜별 그룹핑, 컴팩트 리스트, 배터리 프로그래스바
- **지도 모드** — 경로 속도별 5단계 색상 표시, 이전/다음 탐색
- 자주 가는 곳 TOP5 — 첫/최근 방문일, 평균 이동거리/소요시간, 주요 출발지 TOP3
- 주행 간 대기 시간 표시

### 월별 (`/monthly`)
- 달력 — 일별 주행거리, 주행/충전 횟수 표시
- 연도별 월간 통계 — 거리 바 + 주행횟수 + 충전량·횟수 + 전비(Wh/km) 색상 표시
- 이번 달은 달력에서만 표시, 하단 리스트에서 중복 제거

### 배터리 (`/battery`)
- 배터리 상태 — 건강 점수 게이지 + SOC 분포 히스토그램 + 용량 트렌드
- 충전 통계 — 전체 충전 횟수/kWh, 집·외부 비율, 완속·급속 비율
- 충전 습관 — SOC 체류 분포 + 습관 트렌드
- 급속 충전 기록 — 날짜, 장소, 충전기 타입(SC/CCS), 최소/최대/평균 kW
- 대기 소모 — 뱀파이어 드레인 기록

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

- **프레임워크**: Next.js 14 (App Router) — 포트 5000
- **언어**: JavaScript (ESM)
- **스타일링**: Tailwind CSS 3 — 다크 테마, 모바일 우선
- **DB**: PostgreSQL 16 (TeslaMate 스키마) — `pg` 직접 쿼리
- **지도**: Leaflet 1.9 (CDN, CartoDB Dark 타일, 속도별 경로 색상)
- **컨테이너**: Docker (node:20-alpine)
- **CI/CD**: GitHub Actions → self-hosted runner
- **UI**: 한국어, 30초 자동 갱신, 개발용 Mock 시스템
