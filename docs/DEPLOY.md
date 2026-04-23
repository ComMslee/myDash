# CI/CD (GitHub Actions → Lightsail)

## 현재 상태

**`.github/workflows/deploy.yml`은 이미 Lightsail SSH 방식으로 교체되어 있습니다.**
단, **GitHub Secrets 3개 등록이 안 되어 있으면 배포 실패합니다.**

## 동작 원리

```
git push master
   │
   ▼
GitHub-hosted Ubuntu runner (무료)
   │
   ├─ SSH 접속 (appleboy/ssh-action)
   │  - LIGHTSAIL_HOST  : <LIGHTSAIL_IP>
   │  - LIGHTSAIL_USER  : ubuntu
   │  - LIGHTSAIL_SSH_KEY : lightsail-seoul.pem 내용
   ▼
서버에서 실행:
  cd ~/myDash
  git pull origin master
  docker compose build dashboard
  docker compose up -d dashboard
```

**GHA는 AWS API를 직접 호출하지 않습니다.** SSH로 서버에 접속해 명령만 실행. IAM/AccessKey 같은 AWS 자격 증명은 GHA에 넣을 필요 없음.

## GitHub Secrets 등록 (필수)

1. 저장소 → **Settings → Secrets and variables → Actions**
2. **New repository secret** 3번 반복

| Name | Value |
|---|---|
| `LIGHTSAIL_HOST` | `<LIGHTSAIL_IP>` |
| `LIGHTSAIL_USER` | `ubuntu` |
| `LIGHTSAIL_SSH_KEY` | `lightsail-seoul.pem` **파일 전체 내용** |

### SSH_KEY 값 얻기 (Windows)

PowerShell:
```powershell
Get-Content C:\path\to\myDash\lightsail-seoul.pem | Set-Clipboard
```

Git Bash:
```bash
cat C:\path\to\myDash\lightsail-seoul.pem
```
출력 전체 (`-----BEGIN RSA PRIVATE KEY-----` ~ `-----END RSA PRIVATE KEY-----`) 복사.

## 기존 Secrets 제거 (선택)

이전 self-hosted 배포용 secret은 불필요 (서버 `.env`가 관리):
- `TM_DB_USER`, `TM_DB_PASS`, `TM_DB_NAME`, `ENCRYPTION_KEY`

보안상 사용 안 하는 secret은 삭제 권장.

## 배포 테스트

### 수동 트리거
저장소 → **Actions** → `Deploy Dashboard to Lightsail` → **Run workflow**

### 코드 푸시
```bash
git commit --allow-empty -m "test: trigger deploy"
git push origin master
```

Actions 탭에서 로그 확인. 성공 시 ~2분 이내 서버 반영.

## self-hosted runner 철거 (권장)

Windows PC의 기존 러너를 정리:

```powershell
# Runner 서비스 정지
cd C:\actions-runner
.\svc.cmd stop   # 서비스로 돌고 있다면

# Runner 등록 해제
.\config.cmd remove --token <GitHub에서 새 토큰 발급>

# 자동 재시작 스크립트 비활성화
Remove-Item "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\GitHubActionsRunner.lnk"
```

저장소 → Settings → Actions → Runners 에서 제거됐는지 확인.

## 배포 실패 시

### Secret 누락
오류: `Error: Private key format is invalid` 등
→ 3개 secret 재확인, 특히 `LIGHTSAIL_SSH_KEY`는 `-----BEGIN` 줄부터 `-----END RSA PRIVATE KEY-----` 줄까지 **전체** 포함 필수.

### 서버 Git 상태 꼬임 · 빌드 OOM
[TROUBLESHOOTING.md](./TROUBLESHOOTING.md) 참고.
