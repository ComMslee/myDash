# 접속 방법

## 웹

| 용도 | URL | 인증 |
|---|---|---|
| **Dashboard** | **http://<LIGHTSAIL_IP>/** | dashboard PIN (6자리) |
| **TeslaMate 설정** | **http://<LIGHTSAIL_IP>:4000/** | dashboard PIN 공유 (Caddy forward_auth) |

TeslaMate 4000 포트는 `teslamate-auth`(Caddy) 컨테이너가 dashboard 의 `/api/auth/verify` 로 forward_auth 요청을 보내 PIN 쿠키 (`myDash_auth`) 를 검증한다. 미인증 시 dashboard 의 `/login?next=...` 로 302 리다이렉트되며, 로그인 후 같은 도메인 쿠키 공유로 자동 통과한다 (별도 비밀번호 없음). LiveView WebSocket 도 Caddy 가 자동 업그레이드. 설정 파일: `Caddyfile`.

## SSH

### Windows (PowerShell/CMD/Git Bash)
```bash
ssh -i C:\path\to\myDash\lightsail-seoul.pem ubuntu@<LIGHTSAIL_IP>
```

### 편의 스크립트
- Windows: `docs\scripts\ssh.bat` 더블클릭
- Git Bash: `bash docs/scripts/ssh.sh`

## AWS CLI

로컬 프로파일: `mydash` (`~/.aws/credentials`).

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
| 로컬 프로젝트 | `C:\path\to\myDash` |
| 로컬 SSH 키 | `C:\path\to\myDash\lightsail-seoul.pem` |
| 로컬 AWS 프로파일 | `~/.aws/credentials` (`[mydash]`) |
| 서버 프로젝트 | `/home/ubuntu/myDash` |
| 서버 .env | `/home/ubuntu/myDash/.env` |
| 서버 Compose | `/home/ubuntu/myDash/docker-compose.yml` |

## 방화벽 포트

현재 공개 포트:
| 포트 | 용도 |
|---|---|
| 22 | SSH |
| 80 | Dashboard (→ 5000 컨테이너 포트) |
| 4000 | TeslaMate |

포트 닫으려면:
```bash
aws --profile mydash lightsail put-instance-public-ports \
  --instance-name mydash-prod --region ap-northeast-2 \
  --port-infos fromPort=22,toPort=22,protocol=tcp
# → SSH만 남기고 80/4000 차단
```
