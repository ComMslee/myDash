---
name: pii-mask
description: 저장소(주로 md/설정) 에서 개인정보·식별 정보·반정적 비밀을 스캔하고 placeholder 로 마스킹한다.
trigger: "개인정보 검토, 개인정보 노출, 개인정보 점검, 개인정보 제거, 개인정보 처리, pii 검사, pii scan, pii check, secret scan, secrets 검사, secrets 점검, 민감정보 점검, 민감정보 마스킹, 마스킹, 비밀 검사, 토큰 검사, api key 검사, 공개 전 점검, push 전 점검"
user-invocable: true
---

# PII / Identifier Mask

공개 직전의 저장소에서 문서·설정에 실수로 남은 식별 정보를 한 번에 찾아 placeholder 로 치환한다. 실제 비밀(예: 실 API 키, 사설 pem)은 여기서 발견되면 즉시 rotate 권고.

`docs-drift-audit` 직후 연계 실행을 권장 — 드리프트 수정 과정에서 새로 섞여 들어간 예시 값(IP·계정·경로)이 흔히 마스킹 누락으로 남는다.

## 스캔 대상

기본 범위:
- 문서: `*.md` (README·CLAUDE·docs/*·ARCHITECTURE·CODE_CONVENTIONS·RUNBOOK 등 모든 dev/infra doc)
- 설정: `*.yml`, `*.yaml`, `docker-compose*.yml`, `*.env*.example`, `*.json` (설정류)
- 스크립트: `*.sh`, `*.ps1`, `*.bat` (경로/자격 참조 잦음)

노트: `.env` 자체는 gitignore 여야 정상. 스캔에 잡히면 우선 `.gitignore` 부터 점검.

## 검출 패턴

| 카테고리 | 정규식 힌트 | 제안 placeholder |
|---|---|---|
| IPv4 (퍼블릭 대역) | `\b(?!10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|0\.|169\.254\.)\d{1,3}(\.\d{1,3}){3}\b` | `<LIGHTSAIL_IP>` / `<PUBLIC_IP>` |
| AWS 계정 (12자리) | `\b\d{12}\b` (컨텍스트: "account", "계정") | `<AWS_ACCOUNT_ID>` |
| AWS Access Key | `AKIA[0-9A-Z]{16}` | ⚠️ **즉시 rotate**, 단순 마스킹 금지 |
| Tailscale Auth Key | `tskey-auth-[A-Za-z0-9]+` | ⚠️ **즉시 rotate** |
| GitHub PAT | `ghp_[A-Za-z0-9]{36,}` / `github_pat_[A-Za-z0-9_]{22,}` | ⚠️ **즉시 rotate** |
| OpenAI/Anthropic key | `sk-[A-Za-z0-9\-]{20,}` / `sk-ant-[A-Za-z0-9\-]+` | ⚠️ **즉시 rotate** |
| SSH private key 블록 | `-----BEGIN .*PRIVATE KEY-----` | ⚠️ **즉시 rotate** |
| JWT | `eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+` | 컨텍스트 확인 후 rotate |
| Windows 로컬 계정 경로 | `C:\\Users\\[^\\\\]+\\` | `C:\path\to\project` |
| macOS 홈 | `/Users/[^/]+/` | `~/` |
| Unix 홈 | `/home/[^/]+/` (값이 민감하면) | `$HOME/` |
| SSH 사용자명@호스트 | `[a-z_][a-z0-9_-]*@[0-9a-z.-]+` (로컬 식별 유추) | `<user>@<host>` |
| 실명 유추 프로파일 | `liam-lee`, `<firstname>-<lastname>` 형태 | `<AWS_PROFILE_NAME>` |

## 실행 단계

### 1단계: 스캔

```bash
# 전체 md/yml 대상
grep -rnE "<pattern>" --include="*.md" --include="*.yml" --include="*.yaml" <repo>
```

각 카테고리별로 grep 실행. 결과는 **파일:줄:내용** 형식으로 수집.

### 2단계: 우선순위 분류

사용자에게 결과를 3단계로 보여준다:

- 🔴 **즉시 rotate 필요** — 실제 비밀(API key, auth key, private key). 마스킹 전에 발급사에서 폐기부터.
- 🟠 **즉시 마스킹** — 계정 번호, 실명 유추, 로컬 경로 (무조건 가려도 기능 영향 없음)
- 🟡 **판단 필요** — 퍼블릭 IP, 리소스 이름처럼 이미 공개된 값이거나 운영상 남겨야 할 수 있는 것

사용자 지시로 범위 확정.

### 3단계: 치환

파일이 많으면 `Edit` 을 `replace_all=true` 로 쓰고, 파일별 치환 값이 다르면 파일별로 나눠 실행.

### 4단계: 잔여 검증

치환 후 다시 grep 으로 0건 확인. 원본 값이 남아있으면 누락 — 다시 수정.

### 5단계: git 이력 경고

**중요**: 파일만 고쳐도 git 이력에는 원본이 남는다. 완전한 제거가 필요한 경우:

- 저장소가 **아직 공개 전/원격 없음**: `git filter-repo` 또는 `git filter-branch` 로 rewrite, 그 뒤 push
- **이미 공개 저장소**: filter-repo + force push + 기존 clone 소유자에게 재클론 요청. 민감 비밀이면 rotate 가 보조 아닌 **본** 대책

사용자에게 이 사실을 반드시 고지한다.

## 주의

- 치환 범위(범용 `<PLACEHOLDER>`) 와 프로젝트 통용 이름(`<LIGHTSAIL_IP>`) 중 사용자 선호를 먼저 물어본다
- `tskey-auth-xxxx`·`xxxxxxxxxxxxx`·`<VAR>`·`<your-…>` 같은 **명시 placeholder** 는 이미 마스킹된 상태 — 재치환 금지
- 오탐 패턴 (스캔 결과에서 제외해야 함):
  - `${VAR}` / `$ENV_NAME` 환경변수 참조 — 실값 아님
  - `<PLACEHOLDER>` 형태의 꺾쇠 태그
  - 이미 `xxxx`·`****`·`...` 등으로 마스킹된 토큰
  - 공식 문서 예제(`AKIAIOSFODNN7EXAMPLE`, `password`, `your_password`, `your_encryption_key` 등 문서 관례 예시값)
  - 프라이빗 대역 IP (10.*, 192.168.*, 172.16-31.*, 127.*, 169.254.*) — 보통 로컬 개발
- 사내 리소스 이름(`mydash-prod`·`mydash-cli` 등 기능 식별자)은 보통 마스킹 불필요 — 사용자 확인 후 결정
