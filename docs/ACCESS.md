# 접속 방법

## 웹 대시보드

### 방법 A — Tailscale (권장, 설정 후)

Tailscale 설정 완료 후 ([TAILSCALE.md](./TAILSCALE.md)):

- Dashboard: `http://mydash-aws:5000` (또는 Tailscale 할당 IP:5000)
- TeslaMate 관리: `http://mydash-aws:4000`

### 방법 B — SSH 터널 (임시, 방화벽 열지 않고)

로컬에서:
```bash
ssh -i lightsail-seoul.pem -L 5000:localhost:5000 -L 4000:localhost:4000 ubuntu@43.202.133.239
```
→ 브라우저에서 `http://localhost:5000` / `http://localhost:4000`

### 방법 C — 퍼블릭 HTTPS (비추천)
80/443 열고 Caddy 추가해야 함. 현재 미구성.

## SSH

### Windows (PowerShell/CMD/Git Bash)
```bash
ssh -i C:\Users\lmskn\Downloads\myDash\lightsail-seoul.pem ubuntu@43.202.133.239
```

### 편의 스크립트
`docs/scripts/` 폴더의 스크립트 사용:
- Windows: `docs\scripts\ssh.bat` 더블클릭
- Git Bash/WSL: `bash docs/scripts/ssh.sh`

## AWS CLI

로컬 프로파일: `mydash` (`~/.aws/credentials`에 저장됨).

```bash
# Windows
"C:\Program Files\Amazon\AWSCLIV2\aws.exe" --profile mydash lightsail get-instances --region ap-northeast-2

# 편의 스크립트 (Git Bash)
bash docs/scripts/aws-status.sh
```

자주 쓰는 명령:
| 목적 | 명령 |
|---|---|
| 인스턴스 상태 | `aws --profile mydash lightsail get-instance --instance-name mydash-prod --region ap-northeast-2` |
| 재부팅 | `aws --profile mydash lightsail reboot-instance --instance-name mydash-prod --region ap-northeast-2` |
| 정지 | `aws --profile mydash lightsail stop-instance --instance-name mydash-prod --region ap-northeast-2` |
| 시작 | `aws --profile mydash lightsail start-instance --instance-name mydash-prod --region ap-northeast-2` |
| 스냅샷 목록 | `aws --profile mydash lightsail get-instance-snapshots --region ap-northeast-2` |
| 수동 스냅샷 | `aws --profile mydash lightsail create-instance-snapshot --instance-snapshot-name manual-$(date +%Y%m%d) --instance-name mydash-prod --region ap-northeast-2` |
| 포트 상태 | `aws --profile mydash lightsail get-instance-port-states --instance-name mydash-prod --region ap-northeast-2` |

## 주요 경로

| 위치 | 경로 |
|---|---|
| 로컬 프로젝트 | `C:\Users\lmskn\Downloads\myDash` |
| 로컬 SSH 키 | `C:\Users\lmskn\Downloads\myDash\lightsail-seoul.pem` |
| 로컬 AWS 프로파일 | `~/.aws/credentials` (`[mydash]`) |
| 서버 프로젝트 | `/home/ubuntu/myDash` |
| 서버 .env | `/home/ubuntu/myDash/.env` |
| 서버 Compose | `/home/ubuntu/myDash/docker-compose.yml` |
