---
name: release-check
description: master 푸시 전 코드리뷰 팀(code-reviewer 2 + verifier 1)을 돌려 최근 커밋을 read-only로 점검하고, MEDIUM+ 심각도만 수정한 뒤 docs/와 CLAUDE.md를 실제 코드 상태와 동기화한다. 기능 변경 없음.
---

# release-check

myDash 프로젝트의 배포 전 1패스 점검 스킬. 코드리뷰·선택적 수정·문서 동기화를 한 번에 처리한다.

## 자연어 트리거 (추천)

다음 표현 중 하나라도 감지되면 본 스킬을 우선 고려:

- "배포 전 점검", "배포 전 리뷰", "푸시 전 점검", "master 푸시 전"
- "릴리즈 체크", "릴리스 체크", "릴리즈 준비", "릴리스 준비"
- "머지 전 확인", "커밋 전 점검"
- "코드리뷰하고 문서 업데이트", "리뷰 + 문서 동기화"
- "점검하고 문서도 손봐줘", "코드점검 + docs 싱크"
- "스프린트 마무리", "스프린트 랩업"
- "문서 drift 확인", "문서 동기화", "docs 싱크"
- "최근 커밋 점검", "최근 변경 리뷰"
- `/release-check`, `/release`

## 입력 (모두 선택적)

| 항목 | 기본값 |
|------|--------|
| 리뷰 범위 | `HEAD~10..HEAD` (또는 `origin/master..HEAD`) |
| 심각도 임계값 | `MEDIUM+` (HIGH/MEDIUM 적용, LOW/Info 보고만) |
| 커밋 수행 | `false` (사용자가 명시 요청해야 수행) |

호출 시 사용자가 override 가능: 예) "LOW까지 다 고쳐줘", "최근 5커밋만".

## 절차

### 1. 동기화 + 범위 파악

```
git pull
git log --oneline -15
git diff HEAD~10..HEAD --stat
```

변경 파일 토폴로지로 리뷰 스플릿 결정:
- UI 영역: `dashboard/app/**/*.js` (컴포넌트/페이지)
- 서버 영역: `dashboard/lib/**`, `dashboard/app/api/**`, SQL/스키마
- 양쪽 모두 변경 → **code-reviewer 2명 + verifier 1명** (3병렬)
- 한쪽만 변경 → **code-reviewer 1명 + verifier 1명** (2병렬)

### 2. 팀 리뷰 (병렬, 모두 READ-ONLY)

각 에이전트 프롬프트에 필수 포함:

- **"READ-ONLY 코드 리뷰 — 기능 변경 절대 금지. 파일 수정 금지, 발견 사항만 보고."**
- 리뷰 범위 파일 목록 + 관련 커밋 해시/메시지
- 프로젝트 컨텍스트: 한국어 UI, 다크 테마(`#0f0f0f`/`#161618`), KST(UTC+9), `max-w-2xl mx-auto`, 단일 차량, `force-dynamic`
- 보고 형식: severity(High/Medium/Low/Info) + `file:line` + 근거 + 제안 (수정은 금지)

에이전트 타입:
- UI 리뷰어: `oh-my-claudecode:code-reviewer`
- 서버 리뷰어: `oh-my-claudecode:code-reviewer`
- QA: `oh-my-claudecode:verifier` (회귀·엣지케이스·수동 테스트 체크리스트)

### 3. 심각도 필터

| 심각도 | 처리 |
|--------|------|
| HIGH | 무조건 적용 대상 (사용자 승인 후) |
| MEDIUM | 기본 적용 대상 |
| LOW/Info | 보고만. 사용자 명시 요청 시 적용 |

중복/상충되는 findings는 중복 제거하고 사용자에게 통합 보고.

### 4. 수정 + 검증

- Edit로 **기능 변경 없는 항목만** 수정 (dead code 제거, stale 주석, 오탈자, 린트성 개선)
- 각 수정 파일: `node --check <path>` 실행
- 제거한 식별자/stale 문자열: 프로젝트 전체 `grep`으로 0건 확인
- 로컬 빌드 시도 금지 — 이 프로젝트는 `node_modules` 로컬 부재, CI(GitHub Actions → Lightsail)가 빌드 검증

### 5. 문서 동기화 (drift 체크리스트)

코드 변경 시 아래 매핑에 따라 문서 업데이트:

| 코드 변경 유형 | 업데이트 대상 문서 |
|---------------|-------------------|
| 상수값 변경 (TTL, 폴링, 캐시 계층) | `docs/CODE_CONVENTIONS.md` 자동 갱신 주기 섹션 |
| 신규 테이블/컬럼 | `docs/DATABASE.md` 테이블 목록 + 스키마 표 |
| 신규 파일/폴더 | `docs/PROJECT_STRUCTURE.md` 트리 |
| 신규 API 라우트 | `docs/PROJECT_STRUCTURE.md` API 라우트 섹션 |
| 외부 문서 버전(`*.docx` 등) | `docs/EV_CHARGER_API.md` 참고 문서 섹션 |
| 신규 환경 변수 | `docs/DATABASE.md` 환경 변수 표 |
| 배포/운영 절차 변경 | `docs/DEPLOY.md`, `docs/OPERATIONS.md` |
| 접속 방법/포트 변경 | `docs/ACCESS.md` |
| Tailscale 설정 변경 | `docs/TAILSCALE.md` |

각 문서 업데이트 후 전체 프로젝트에 대해 **stale 문자열 grep으로 잔존 0건 확인** (예: 이전 TTL 범위 `3~40분`, 이전 버전 `v1.22.docx`).

### 6. 최종 검증

- `git diff --stat`: 의도한 파일만 변경됐는지 확인
- 열린 HIGH findings = 0
- 적용 대상 심각도 중 미적용 = 0 (또는 보류 사유 보고)
- stale 문자열 grep = 0건
- 수정 파일 `node --check` 전부 통과
- 사용자에게 최종 요약 보고 (파일/라인 수준)

### 7. 커밋 (사용자 명시 요청 시에만)

프로젝트 커밋 스타일을 분리 적용:
- 코드 수정: `refactor:` 또는 `style:` 또는 `fix:`
- 문서 업데이트: `docs:`

한 번에 많은 변경이면 의미 단위로 분리 커밋. `master` 푸시는 즉시 auto-deploy 되므로 반드시 사용자 명시 승인 후 push.

## 성공 기준

- 모든 HIGH findings 해결됨
- 기본 임계값(MEDIUM+) 내 적용 대상 처리 완료
- 수정된 코드 파일 `node --check` 통과
- 문서 drift 체크리스트 8개 항목 모두 검토
- 프로젝트 전역에서 stale 문자열 grep 0건
- `git diff --stat`가 의도한 파일 집합으로 한정

## 제약 / 함정

- **auto-deploy**: `master` push 시 GitHub Actions가 Lightsail로 즉시 배포. 커밋·푸시는 사용자 명시 지시할 때만.
- **기능 변경 금지 원칙**: 합리적 리팩터·기능 개선도 본 스킬 범위에선 하지 않음. 별도 요청으로 분리.
- **로컬 빌드 불가**: `dashboard/node_modules` 부재. `next build` 시도 금지.
- **병렬 호출 강제**: 여러 파일 Read / 여러 패턴 Grep / 독립적 Bash는 반드시 한 메시지 내 병렬로 호출(훅이 경고).
- **읽기 전용 에이전트**: 팀 리뷰 단계에서 에이전트가 파일을 수정하면 즉시 롤백하고 프롬프트의 "READ-ONLY" 강조 후 재실행.
- **한국어 UI 유지**: 레이블·에러·단위 영문화 금지.
- **중복 발견 정리**: 2명 이상의 리뷰어가 같은 항목을 지적하면 한 번만 처리.

## 대표 호출 예시

```
/release-check
/release-check LOW까지 적용
/release-check 최근 5개 커밋만
배포 전 점검해줘
릴리즈 체크 돌리고 문서도 맞춰줘
코드리뷰 팀 돌리고 docs 싱크
master 푸시 전 리뷰해줘
```

## 관련 문서

- `/home6/liam/_claude_myDash/CLAUDE.md` — 프로젝트 규칙 요약
- `docs/CODE_CONVENTIONS.md` — UI/데이터/컴포넌트 규칙
- `docs/DEPLOY.md` — 배포 파이프라인
- `docs/PROJECT_STRUCTURE.md` — 파일 트리
