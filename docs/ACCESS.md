# 접속 방법

## 웹

| 용도 | URL |
|---|---|
| **Dashboard** | **http://43.202.133.239/** |
| **TeslaMate 설정** | **http://43.202.133.239:4000/** |

둘 다 **공개 상태**. 인증 없이 URL만 알면 누구나 접근. 개인용이면 OK.

## SSH

### Windows (PowerShell/CMD/Git Bash)
```bash
ssh -i C:\Users\lmskn\Downloads\myDash\lightsail-seoul.pem ubuntu@43.202.133.239
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
| 로컬 프로젝트 | `C:\Users\lmskn\Downloads\myDash` |
| 로컬 SSH 키 | `C:\Users\lmskn\Downloads\myDash\lightsail-seoul.pem` |
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
