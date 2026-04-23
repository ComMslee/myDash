---
name: docs-drift-audit
description: CLAUDE.md 와 docs/ 가 실제 코드 상태와 일치하는지 감사하고, 드리프트(오기재·유령 참조·stale 지시)를 수리한다.
trigger: "docs 정리, docs 점검, docs 업데이트, docs cleanup, docs drift, docs audit, docs sync, docs update, 문서 정리, 문서 점검, 문서 업데이트, 문서 최신화, 문서 감사, 문서 동기화, claude.md 정리, claude.md 점검, claude.md 업데이트, readme 정리, readme 점검, readme 업데이트, readme cleanup, 구조 문서 확인, 파일 구조 문서"
user-invocable: true
---

# Docs Drift Audit

CLAUDE.md · `docs/*.md` · 루트 `README.md` 가 현재 코드/인프라와 어긋나는 부분을 찾아 바로잡는 스킬.

## 언제 쓰나

- 장시간 기능 추가 후 문서가 구조를 못 따라간다고 의심될 때
- 신규 계약자/에이전트에게 문서를 넘기기 직전
- 리팩터로 파일·라우트가 대규모로 움직였을 때

## 실행 단계

### 1단계: 코드 실태 스냅샷 수집 (병렬)

반드시 **docs 를 읽기 전에** 현재 코드를 먼저 본다. 순서가 바뀌면 문서 주장에 끌려가 드리프트를 놓친다.

수집 항목:
- 라우트 트리 — `find <app_root> -name "page.js" -o -name "page.tsx" -o -name "+page.svelte"` 등 프레임워크에 맞춰
- API 라우트 — `<app>/api/**/route.*`
- 공용 라이브러리 — `lib/` 또는 `src/lib/` 엔트리 목록
- 컴포넌트 디렉토리 트리
- 패키지 — `package.json` (프레임워크·버전)
- 컨테이너 구성 — `docker-compose*.yml` 서비스·포트 매핑
- 배포 — `.github/workflows/*.yml` runner 유형, 배포 대상
- **사용자 진입점 컴포넌트 직독** — 하단 탭/네비/사이드바 JSX를 열어 실제 렌더되는 탭 수·라벨·라우트 확인 (문서 기재와 자주 어긋남)

### 2단계: 문서 주장 대조

각 docs 파일을 읽으면서 아래 drift 패턴을 체크:

| 드리프트 유형 | 예시 |
|---|---|
| 유령 참조 | 문서에 있지만 실제로 없는 파일/라우트/폴더 |
| 누락 | 코드에 있지만 문서에 없는 라우트/lib/컴포넌트 |
| 오기재 | `self-hosted runner` vs 실제 GitHub-hosted, 포트 번호 불일치 |
| 타입/카운트 오류 | "N개 컨테이너" / "N탭" 숫자가 실제와 다름 |
| 상호 모순 | CLAUDE.md 와 docs/README.md 가 서로 다른 주장 |
| **cross-doc value 불일치** | 같은 값(포트·서비스 수·인증 방식·파일 경로)이 여러 문서에 등장하는데 값이 서로 다름 |
| stale 명령 | 더 이상 동작하지 않는 script/flag/opts |

**cross-doc value consistency 검증 팁**: 주요 상수(퍼블릭 포트, 서비스 개수, 인증 방식, 주요 파일 경로)는 `grep -n` 으로 모든 md 를 훑어 값이 통일됐는지 확인. 한 곳에서 "포트 80" 이라 써도 다른 곳이 "포트 5000" 이면 둘 중 하나가 stale 이다.

각 drift에 대해 **파일:줄 + 현재 주장 + 실제 상태** 를 표로 정리.

### 3단계: 드리프트 리포트 후 사용자 승인

드리프트 표를 사용자에게 먼저 보여주고 수정 범위 확인. 자동 수정 **금지** — 사용자가 범위를 선택하게 한다.

### 4단계: 수정

- `Edit` 로 파일별 정정
- 파일 트리 같은 큰 섹션은 `Write` 로 전체 재작성
- 변경 후 반드시 다시 읽어 검증

### 5단계: 과대 문서 분할 제안 (옵션)

100줄 이상 + 섹션 5개 이상이면 분할 후보. 책임 기준으로 2-3개로 쪼갠다.
예: `OPERATIONS.md` (운영 일상 + 백업 + 트러블슈팅) → `OPERATIONS.md` / `BACKUP.md` / `TROUBLESHOOTING.md`.

분할 후 **반드시** 다음을 업데이트:
- 상위 인덱스 (CLAUDE.md 의 문서 테이블, docs/README.md 의 목차)
- 상호 링크

### 6단계: PII 스캔 연계 (공개/push 직전 권장)

드리프트 수정 과정에서 예시 값으로 IP·계정·경로가 새로 섞일 수 있다. 수정 완료 후 **`pii-mask` 스킬을 이어서 실행**하여 마스킹 누락을 점검한다. 기존 placeholder 가 이미 있던 경우에도 신규 변경 섹션에 원본 값이 재유입되는 케이스가 잦으므로 생략 금지.

## 주의

- README.md (루트) 는 GitHub 랜딩이므로 docs/ 와 중복되는 상세 내용은 제거 → 포인팅만 남김
- 절대로 사용자 승인 없이 커밋하지 않는다
- 코드 trust but verify — 커밋 로그가 아니라 **현재 파일 상태** 가 진실
