# Telegram Hub — 사용/운영 가이드

> 설계 배경은 [PLAN.md](./PLAN.md) 참고. 이 문서는 **현재 가동 중인 hub의 사양/사용법**.

## 1. 무엇을 하는 봇

- **알림(out)**: TeslaMate DB 변동 감지 → 권한 보유자에게 Telegram 메시지
  - 충전 시작 / 충전 완료 / 주행 종료(>=0.5 km)
- **명령(in)**: Telegram에서 사용자가 보낸 메시지 → DB 조회 → 응답
  - `/cmd` 스타일 + 자연어 키워드 일부 인식
- **운영**: 가입 신청 / 승인 / 권한 부여 / 자연어 학습 루프

## 2. 아키텍처 (현재)

```
TeslaMate DB ──┬──► telegram-hub (Node 20, ~80MB RAM)
               │     ├─ 5초마다 charging_processes/drives 폴링 → 신규 이벤트 알림
               │     ├─ Telegram getUpdates long-poll 25초
               │     ├─ Express 없이 http 서버 :3000 — POST /notify (외부용)
               │     └─ /data 볼륨에 state.json (이벤트 baseline + getUpdates offset)
               │
               └──► dashboard (기존)
                     └─ /api/server-status 가 hub /health 호출 → api-status 페이지에 표시
```

- **컨테이너 외부 노출 없음** (long-polling이라 inbound 불필요)
- **state**: `last_charge_start_id`, `last_charge_end_id`, `last_drive_end_id`, `telegram_offset`
- **DB 테이블 신규 3개** (모두 `services/telegram-hub` 가 idempotent 생성):
  - `hub_users` — chat_id, name, role(root/user/pending/denied)
  - `hub_permissions` — chat_id, feature
  - `hub_unmatched_inputs` — 미인식 입력 누적 (학습 로그)

## 3. 환경 변수 (서버 `~/myDash/.env`만, git 미반영)

| 변수 | 필수 | 설명 |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | BotFather에서 받은 봇 토큰 |
| `TELEGRAM_CHAT_ID` | ✅ | root chat_id (부팅 시 자동으로 role=root 부여) |
| `HUB_SHARED_SECRET` | 선택 | `/notify` 외부 호출용 Bearer secret. 비워두면 인증 생략 |
| `TG_HUB_DB_POLL_MS` | 선택 | 기본 5000(5초). 이벤트 감지 주기 |
| `TELEGRAM_HUB_URL` | 선택 | dashboard에서 hub /health 호출 URL. 기본 `http://telegram-hub:3000` |

**root 부트스트랩**: 컨테이너 부팅 시 `TELEGRAM_CHAT_ID`를 `hub_users` 에 `role=root` + `car` 권한으로 강제 upsert.

## 4. RBAC — 역할/권한

### 역할

| role | 의미 |
|---|---|
| `root` | 전권. 모든 명령 + 모든 카테고리 접근 |
| `user` | 승인된 일반 사용자. 부여된 카테고리만 사용 |
| `pending` | 가입 신청 상태. 데이터 명령 사용 불가 (자동 안내) |
| `denied` | 차단됨. 모든 메시지 무시(silent) |

### 카테고리(feature)

`services/telegram-hub/src/categories.js` 가 단일 소스:

| key | label | 설명 |
|---|---|---|
| `car` | 🚗 차 | 내 테슬라 상태/위치/충전 |

신규 카테고리 추가 시: `categories.js`에 한 줄 + 핸들러에 `feature` 태그.

### 상태 전이

```
       /start (첫 메시지)         /approve
   ┌────────────────────► pending ────────► user ◄──┐
   │                                          │      │ /approve
   │                                          │      │
   └─                              /deny      ▼      │
                                            denied ──┘
```

## 5. 명령 레퍼런스

### 데이터 (`car` 권한 필요)

| 명령 | 설명 |
|---|---|
| `/soc` | 현재 배터리 % + 충전 여부 |
| `/today` | 오늘(KST) 주행 횟수/거리/시간 + 충전 횟수/kWh |
| `/where` | 현재 위치 (지도 링크 + 핀) |

### 공통 (누구나)

| 명령 | 설명 |
|---|---|
| `/help` | 본인 권한 기준 도움말 |
| `/whoami` | 본인 chat_id, 역할, 보유 카테고리 |
| `/categories` | 등록된 카테고리 + 본인 보유 표시(✅/⬜) |
| `/start` | `/help`와 동일 |

### 관리자 (root)

| 명령 | 사용법 | 효과 |
|---|---|---|
| `/pending` | — | 가입 대기자 목록 |
| `/approve <chat_id>` | `/approve 123` | pending/denied → user |
| `/deny <chat_id>` | `/deny 123` | 어떤 role이든 → denied |
| `/grant <chat_id> <feature>` | `/grant 123 car` | 권한 부여 |
| `/revoke <chat_id> <feature>` | `/revoke 123 car` | 권한 회수 |
| `/users` | — | 전체 사용자 + 카테고리 매트릭스 |
| `/unmatched` | — | 미인식 입력 최근 20건 |
| `/topnope` | — | 자주 못 알아들은 표현 TOP 5 |
| `/resolve <id1,id2,...>` | `/resolve 1,2,3` | 미인식 입력 해결 처리 |

## 6. 자연어 라우팅

`/cmd`를 안 붙여도 일부 표현은 매칭됨. 패턴은 [commands.js](../../services/telegram-hub/src/commands.js)의 `NL_PATTERNS`.

| 명령 | 매칭되는 키워드 |
|---|---|
| `/soc` | 배터리 / 충전상태 / soc / 몇 % / 얼마나 남 / 잔량 / 등 |
| `/today` | 오늘 / today / 얼마나 달렸 / 운행 기록 / 등 |
| `/where` | 어디 / 위치 / where / 지도 / 등 |
| `/help` | 도움말 / help / 명령 뭐 / 등 |

매칭 실패 시 → `hub_unmatched_inputs`에 기록 + "잘 모르겠어요" 응답.

### 학습 루프

```
1. 사용자가 자연어 입력
2. 매칭 안 됨 → DB에 로깅
3. 며칠 운영
4. /topnope 로 자주 등장하는 미인식 표현 확인
5. NL_PATTERNS 에 한 줄 추가 → push → 자동 배포
6. /resolve <ids> 로 정리
```

## 7. `/notify` HTTP 엔드포인트 (외부 서비스용)

같은 docker network 안에서 다른 서비스가 알림을 보낼 때.

```bash
# 같은 box (docker network):
curl -X POST http://telegram-hub:3000/notify \
  -H "Content-Type: application/json" \
  -d '{"text":"빌드 실패 — main.go:42","chat_id":"8704087232"}'

# Authorization: Bearer 헤더 필요 (HUB_SHARED_SECRET 설정 시)
```

| 엔드포인트 | 메서드 | 설명 |
|---|---|---|
| `/health` | GET | uptime + state 반환 (인증 불필요) |
| `/notify` | POST | `{ text, chat_id? }` 메시지 발송. chat_id 미지정 시 root |

## 8. 운영 시나리오

### 와이프 추가하고 SNS만 부여

```
와이프: 봇한테 "hi" 또는 /start
       ← "가입 신청 접수됨"
본인 (root에게 자동 푸시):
  🔔 신규 가입 신청 #9999 김와이프
본인: /approve 9999
본인: /grant 9999 sns         ← car 안 줌
와이프: /soc                  ← "🔒 'car' 권한이 필요해요"
와이프: /sns ...              ← (미래에 SNS 구현 시 작동)
```

### 모르는 사람 차단

```
낯선 사람: 봇한테 메시지
본인: /pending → #5555 stranger
본인: /deny 5555
       → 이후 그 사람 메시지 silent 처리
```

### 자연어 패턴 보강

```
본인: /topnope
봇: × 4  전기 얼마나 썼어
   × 2  에너지 사용량
본인: (commands.js NL_PATTERNS 에 추가)
       { feature: 'car', re: /(전기|에너지).*(썼|사용)/i, handler: cmdUsage }
       (cmdUsage 신규 작성 + push)
본인: /resolve 42,51
```

## 9. 관찰성

대시보드 `/v2/dev/api-status` → "텔레그램 봇" 카드:

- 컨테이너 상태 / CPU / 메모리
- hub /health 응답 (ok / error)
- uptime
- 알림 baseline (`c<charging_id> d<drive_id>`)
- Telegram update offset

dashboard는 30초마다 hub `/health`를 호출해서 표시.

## 10. 디버깅

```bash
# 로그
sudo docker compose logs -f telegram-hub

# 컨테이너 내부에서 health 확인
sudo docker exec mydash-telegram-hub-1 wget -qO- http://localhost:3000/health

# DB 상태
sudo docker exec mydash-database-1 psql -U teslamate -d teslamate \
  -c "SELECT chat_id::text, name, role FROM hub_users;"
sudo docker exec mydash-database-1 psql -U teslamate -d teslamate \
  -c "SELECT chat_id::text, feature FROM hub_permissions;"

# state 파일 (volume)
sudo docker exec mydash-telegram-hub-1 cat /data/state.json
```

## 11. 토큰 재발급 (보안 사고 시)

```
1. Telegram BotFather 채팅 → /revoke → 봇 선택 → 새 토큰
2. SSH: ~/myDash/.env 의 TELEGRAM_BOT_TOKEN 값 교체
3. sudo docker compose restart telegram-hub
```

chat_id는 변경 불가 (Telegram 사용자 ID는 영구).

## 12. 알려진 함정

- `start_date` 가 `timestamp without time zone`(UTC 값) — KST 경계 비교는 JS에서 계산해서 파라미터로 전달 (commands.js `cmdToday` 참고).
- pg가 `numeric/real`을 string으로 줄 수 있어 메시지 만들 때 `Number()` 강제 변환.
- Telegram API는 4xx/5xx도 fetch가 reject 안 함 → `r.ok` 체크 필수.
- 단일 차량 가정 — `SELECT id FROM cars LIMIT 1`.

## 13. 코드 위치

```
services/telegram-hub/
├── Dockerfile
├── package.json
└── src/
    ├── index.js        — 부팅 + root 부트스트랩
    ├── auth.js         — RBAC (역할/권한 CRUD)
    ├── categories.js   — 카테고리 카탈로그
    ├── commands.js     — 명령 라우팅 + 핸들러
    ├── tg_poller.js    — Telegram getUpdates long-poll
    ├── poller.js       — TeslaMate DB 폴링 → 알림 broadcast
    ├── notify.js       — HTTP 서버 (/health, /notify)
    ├── telegram.js     — Telegram API 래퍼
    ├── db.js           — pg pool
    ├── state.js        — /data/state.json IO
    └── format.js       — KST 시각/duration 포맷
```
