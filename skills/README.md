# Reusable Skills

이 프로젝트의 Lightsail 포팅 작업에서 추출한 재사용 가능한 스킬 목록.
Claude Code · Claude Desktop의 `skills/` 폴더(또는 `~/.claude/skills/`)에 복사해서 사용.

## 목록

| 스킬 | 설명 | 트리거 |
|---|---|---|
| [aws-lightsail-docker-deploy](./aws-lightsail-docker-deploy/SKILL.md) | docker-compose 앱을 AWS Lightsail에 배포 | "lightsail 배포", "vps 이전", "aws 포팅" |
| [aws-iam-cli-bootstrap](./aws-iam-cli-bootstrap/SKILL.md) | IAM 사용자 생성 + CLI 프로파일 세팅 | "aws cli 설정", "iam 사용자 생성" |
| [gha-ssh-deploy](./gha-ssh-deploy/SKILL.md) | GHA를 SSH 원격 배포로 전환 | "github action ssh 배포", "self-hosted 철거" |
| [docker-basic-auth-nginx](./docker-basic-auth-nginx/SKILL.md) | 기존 서비스에 Basic Auth 추가 | "basic auth 추가", "nginx 앞단" |
| [lightsail-firewall-cli](./lightsail-firewall-cli/SKILL.md) | Lightsail 방화벽 CLI 관리 | "lightsail 포트 열어", "방화벽 추가" |

## 설치 예시

```bash
# 단일 스킬 복사
cp -r skills/aws-lightsail-docker-deploy ~/.claude/skills/

# 전체 복사
cp -r skills/*/ ~/.claude/skills/
```

## 구조

각 스킬은 자체 폴더를 가지며 최소한 `SKILL.md` 포함:
```
skills/<skill-name>/
├── SKILL.md          # 메타 + 사용법 + 단계
└── references/       # 샘플 파일·템플릿 (선택)
```
