# Telegram 봇 연동 작업 플랜 (historical)

> 작성: 2026-04-30 — 구현 시작 전 설계 결정 기록.
> **현 운영 사양은 [README.md](./README.md) 참조** — 이 문서는 결정 배경(왜 polling, 왜 monorepo, 왜 1봇 1쳇 등) 추적용으로 보존.

---

## 1. 목적 / 최종 그림

대시보드 ↔ Telegram 봇 양방향 연동. 단기 목표는 dashboard 알림/명령부터,
중기적으로는 **n개 서비스가 한 봇/한 채팅을 공유하는 허브** 구조까지 자연스럽게 확장.

```
            ┌─────────────┐
            │  Telegram   │   ← 봇 1개, chat 1개 (혹은 그룹+Topics)
            └──┬────────▲─┘
        webhook│        │sendMessage
        or poll▼        │
          ┌────────────┴────┐
          │  telegram-hub   │   ← 신규 컨테이너 (services/telegram-hub/)
          │  (Node, Express)│
          └─┬──▲─┬──▲─┬──▲──┘
            ▼  │ ▼  │ ▼  │
        dashboard  Svc2  SvcN  (HTTP POST → /notify, secret 헤더 인증)
```

핵심 원칙:
- **봇/채팅은 입출력 파이프** — 무엇을 하느냐는 허브 라우팅이 결정
- **허브는 HTTP 엔드포인트** — 호출하는 서비스가 어디 살든 무관
  (같은 box, 다른 box, 노트북 cron, GitHub Action … 다 OK)
- **봇 토큰은 허브만 보유**, 다른 서비스는 허브의 공유 secret 으로 인증
  (토큰 N개로 흩뿌리지 말 것)

---

## 2. 아키텍처 결정 (5개) + 추천

| # | 결정 항목 | 옵션 | 추천 | 이유 |
|---|---|---|---|---|
| 1 | 허브 형태 | A) custom Node (Express, ~150줄)<br>B) n8n (워크플로 엔진, GUI) | **A** | 첫 단계라 단순. 메모리 50MB. n8n 은 200~400MB → $7 인스턴스 빠듯 |
| 2 | Telegram inbound 방식 | A) webhook (HTTPS 필수, 즉각)<br>B) long polling (`getUpdates` 루프, 노출 0) | **B (polling)** | 현재 dashboard 가 plain HTTP 80 직노출 → HTTPS 셋업 비용 높음. polling 은 외부 노출 0, AWS 인프라 변경 0 |
| 3 | 알림 트리거 위치 | A) dashboard 안 polling 루프에 hook<br>B) hub 가 TeslaMate DB 직접 polling | **B** | dashboard 와 결합 분리. dashboard 재시작/배포 영향 없음. hub 가 TeslaMate DB 컨테이너에 직접 연결 |
| 4 | MVP 범위 (아래 §3) | — | — | 알림 2~3개 + 명령 2~3개로 시작 |
| 5 | Secret 보관 | A) `.env` 파일 (현재 패턴 유지)<br>B) GitHub Secrets → 배포 시 inject | **A** | 현재 `.env` 가 서버에 직접 존재 (compose 가 `${VAR}` 참조). 같은 패턴으로 `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `HUB_SHARED_SECRET` 추가 |

> **변경 가능성 메모**: HTTPS 가 추후 추가되면 (예: nginx + Let's Encrypt 또는 Cloudflare Tunnel)
> webhook 으로 갈아타는 건 hub 코드 50줄 정도 변경. polling 으로 시작해도 손해 없음.

---

## 3. MVP 범위

### 알림 (out: 서비스 → Telegram)
- [ ] **충전 시작** — `charging_processes` 신규 row 감지 (start_date 기준)
- [ ] **충전 완료** — `charging_processes` end_date 기록 감지 + 최종 SoC/추가 km
- [ ] **주행 종료** — `drives` end_date 감지 + 거리/소요시간/평균 소비

### 명령 (in: Telegram → 서비스)
- [ ] **`/soc`** — 현재 배터리 % + 충전 여부
- [ ] **`/today`** — 오늘 주행 거리/충전량 요약
- [ ] **`/where`** — 현재 위치 (가능하면 지도 링크)

### 비범위 (나중에)
- 사진/음성 처리, LLM 응답, 다른 서비스(라파이 등) 연동
- 그룹+Topics 분리 — 메시지 시끄러우면 그때 마이그레이션

---

## 4. 사전 준비 (사용자가 작업 시작 전에 할 일)

코드 돌아가려면 이 두 개 먼저 필요:

### 4-1. 봇 생성 → 토큰 받기
1. Telegram 에서 `@BotFather` 검색 → 대화 시작
2. `/newbot` 명령 → 이름/유저네임 입력
3. 받은 **HTTP API token** 저장 (예: `1234567890:ABCdef...`)

### 4-2. chat_id 확인
1. 위에서 만든 봇 검색 → 아무 메시지 보내기 (예: "hi")
2. 브라우저에서 다음 URL 열기 (TOKEN 자리에 위 토큰):
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
3. JSON 응답 안 `"chat":{"id":123456789, ...}` 의 숫자 = **chat_id**
4. 저장 (예: `123456789`)

### 4-3. (선택) hub 공유 secret 생성
- 다른 서비스가 hub 호출할 때 `Authorization` 헤더로 쓸 비밀값
- `openssl rand -hex 32` 한 번 돌려서 결과 저장
- MVP 단계에선 dashboard 도 hub 같은 box 안이면 docker network 신뢰로 생략 가능,
  외부 호출자 생기면 그때 도입해도 OK

---

## 5. AWS / SSH 접속이 **필요한** 작업 vs **불필요한** 작업

### 불필요 (코딩 PC 에서 push 만 하면 끝)
- `services/telegram-hub/` 디렉토리 생성 + 코드 작성
- `docker-compose.yml` 에 `telegram-hub` 서비스 추가
- `.github/workflows/deploy.yml` 수정 (hub 도 build/up 하도록)
- dashboard 측 코드 변경 (필요 시)

### 필요 (Lightsail SSH 1회씩)
1. **`.env` 에 신규 secret 3개 추가**
   ```
   TELEGRAM_BOT_TOKEN=1234567890:ABCdef...
   TELEGRAM_CHAT_ID=123456789
   HUB_SHARED_SECRET=...   # 4-3 에서 만든 값 (선택)
   ```
   → `.env` 는 repo 에 없고 서버 `~/myDash/.env` 에 직접 사는 패턴
   → `git push` 만으론 절대 반영 안 됨, 한 번은 SSH 필수

2. **(polling 방식이면 이게 끝)** — 추가 인프라 작업 없음

3. **(나중에 webhook 으로 전환 시에만)** — nginx + 인증서 셋업

### 디버깅용 (필요 시)
- `sudo docker compose logs -f telegram-hub` — 봇 안 동작 시 로그 확인
- `sudo docker compose ps` — 컨테이너 상태

---

## 6. 작업 순서 (제안)

1. **사전 준비 완료 확인** (§4) — 봇 토큰 + chat_id 손에 있나
2. **PLAN 한 번 더 검토** — §2 결정 5개 그대로 갈지, 바꿀지
3. **services/telegram-hub/ 생성**
   - `Dockerfile` (node:20-alpine)
   - `package.json` (express, pg, node-fetch)
   - `src/index.js` (Express + polling 루프 + DB poller + `/notify` 엔드포인트)
4. **docker-compose.yml 에 hub 서비스 추가**
   - TeslaMate DB 접근 환경변수 (`TM_DB_*`, `DB_HOST=database`)
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `HUB_SHARED_SECRET`
   - `depends_on: [database]`
   - 외부 포트 노출 안 함 (polling 이라 inbound 없음)
5. **deploy.yml 수정** — hub 도 build/up 하도록 (`docker compose build` 만 돌려도 됨)
6. **Lightsail SSH** → `.env` 에 secret 3개 append → 저장
7. **push** → GitHub Actions 자동 배포 → 봇 동작 확인
8. **봇한테 `/soc` 보내서 응답 확인 + 충전/주행 알림 첫 트리거 검증**

---

## 7. 디렉토리 / 파일 레이아웃 (예상)

```
_claude_myDash/
├─ dashboard/                   ← 기존, 변경 거의 없음
├─ services/
│  └─ telegram-hub/             ← 신규
│     ├─ Dockerfile
│     ├─ package.json
│     ├─ package-lock.json
│     └─ src/
│        ├─ index.js            ← Express + 부팅
│        ├─ telegram.js         ← Telegram API 래퍼 (sendMessage, getUpdates)
│        ├─ commands.js         ← /soc, /today, /where 핸들러
│        ├─ poller.js           ← TeslaMate DB 변경 감지 → 알림
│        └─ notify.js           ← POST /notify 엔드포인트 (외부 서비스용)
├─ docs/
│  └─ telegram-bot/
│     └─ PLAN.md                ← 이 문서
├─ docker-compose.yml           ← telegram-hub 서비스 추가
└─ .github/workflows/deploy.yml ← hub build/up 추가
```

---

## 8. 향후 확장 (참고만, 지금은 안 함)

### 다른 서비스 붙이기 (라파이, 노트북 cron 등)
- 새 서비스는 어디 살든 OK — 허브의 `/notify` 에 POST 만 하면 됨
- 같은 box 면 docker network (`http://telegram-hub:3000/notify`)
- 다른 box 면 HTTPS + `Authorization: Bearer <HUB_SHARED_SECRET>`
  → 이때 비로소 hub 외부 노출 + 인증서 필요

### 다른 주제 (사진 분석, LLM 챗 등)
- 봇은 그대로, 허브에 라우트만 추가
- 메시지 타입별 분기: 텍스트 → LLM, 사진 → Vision API, 음성 → STT
- 이쯤 되면 n8n 으로 갈아타는 게 코드 관리 편함

### 알림 시끄러우면
- N봇 N쳇 가지 말고 **Telegram 그룹 + Topics(forum 모드)**
- 봇 1개를 그룹에 넣고 `sendMessage` 시 `message_thread_id` 만 다르게
- 토픽별 알림 끄기 가능

---

## 9. 결정 기록 (대화 요약)

### 왜 monorepo (별도 repo 안 만듦)
- 이미 이 repo 에 docker-compose, GitHub Actions → Lightsail 배포 셋업 완비
- dashboard 와 hub 는 거의 항상 같이 변경 (새 알림 = dashboard API + hub 라우트)
- 별도 repo 정당화는 (1) 외부 기여자 (2) 재사용 (3) 배포 주기 분리 — 셋 다 해당 없음

### 왜 1봇 1쳇 (N봇 N쳇 X)
- 토큰/관리 1개, 모바일 핀 1개
- 명령 라우팅은 허브가 첫 단어 보고 분기 (`/soc`, `/charge` …)
- N봇은 (1) 수신자가 다름 (2) 권한 분리 (3) `/start` 응답 다름 — 셋 중 하나일 때만

### 왜 polling (webhook X — 일단)
- webhook 은 HTTPS 필수, 현재 dashboard 가 HTTP 직노출이라 인증서/리버스프록시 신규 셋업 부담
- polling 은 hub 가 `getUpdates` 무한 루프 — 외부 노출 0, 인프라 변경 0
- 응답 지연 1~2초 (long polling timeout 25s) → MVP 충분

### 왜 hub 가 DB 직접 polling (dashboard hook X)
- dashboard 와 hub 결합 분리 → dashboard 재시작 시 알림 안 끊김
- TeslaMate DB 가 단일 소스 — 두 군데서 보면 동일하게 안전
- 단점: hub 가 DB 한 번 더 본다 (부하 무시 가능)

---

## 10. 알려진 함정 (작업 시 주의)

- **TeslaMate `charges` 테이블** — `charge_limit_soc`, `time_to_full_charge` 컬럼 없음
  (CLAUDE.md "알려진 함정" 참조). 알림 메시지에 SoC limit 넣지 말 것
- **`pg` 숫자 타입** — `numeric`/`real` 이 string 으로 올 수 있음. 메시지 만들 때 `Number()` 강제 변환
- **fetch 가 4xx/5xx 도 resolve** — Telegram API 호출 시 `r.ok` 체크 후 throw
- **단일 차량 가정** — `SELECT id FROM cars LIMIT 1`
- **KST(UTC+9)** — 알림 시각 표기 시 timezone 명시

---

## 11. 다음 액션 (작업 재개 시 첫 줄)

1. §4 사전 준비 완료 확인 (토큰 + chat_id)
2. `.env` 에 secret 추가 (SSH 1회)
3. §6 작업 순서대로 — `services/telegram-hub/` 만들고 시작
