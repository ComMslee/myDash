# Telegram Hub — 사용/운영 가이드

> 설계 배경은 [PLAN.md](./PLAN.md) 참고. 이 문서는 **현재 가동 중인 hub의 사양/사용법**.

## 1. 무엇을 하는 봇

- **알림(out)**: TeslaMate DB 변동 감지 → 권한 보유자에게 Telegram 메시지
  - 충전 시작 / 충전 완료 / 주행 종료(>=0.5 km)
- **명령(in)**: Telegram에서 사용자가 보낸 메시지 → **dashboard API 호출** → 텔레그램 응답으로 포맷
  - `/cmd` 스타일만 (자연어 매칭 미지원, §6 참고)
- **운영**: 가입 신청 / 승인 / 권한 부여 / 미인식 입력 학습 로그

> **아키텍처 원칙**: TeslaMate DB 직접 쿼리는 **dashboard 가 전적으로 책임**.
> hub 는 dashboard `/api/*` 를 호출해 결과를 텔레그램 메시지로 포맷만 함.
> 비즈니스 로직 단일 진실원, 스키마 함정 한 번만 처리, 컬럼 변경 자동 전파.
> 새 봇 명령 추가 시: ① 필요한 dashboard API 가 없으면 만들고 ② hub 핸들러는 `dashGet()` 호출.
> 예외: RBAC/가입/권한 등 hub 자체 데이터(`hub_*` 테이블) 는 hub 가 직접 관리.

## 2. 아키텍처 (현재)

```
TeslaMate DB ──┬──► dashboard (Next.js)
               │     └─ /api/* — 단일 진실원. SOC/주행/충전/주차/요약 등
               │
               └──► telegram-hub (Node 20, ~80MB RAM)
                     ├─ 5초마다 charging_processes/drives 폴링 → 신규 이벤트 알림 (DB 직접)
                     ├─ Telegram getUpdates long-poll 25초
                     ├─ 사용자 명령 → dashGet('/api/...') → 메시지 포맷 (DB 직접 X)
                     ├─ http 서버 :3000 — POST /notify (외부용)
                     └─ /data 볼륨에 state.json (이벤트 baseline + getUpdates offset)

dashboard ⇄ hub: 양방향 X-Hub-Secret 헤더 (HUB_SHARED_SECRET) 로 인증
  - dashboard → hub: /health 호출
  - hub → dashboard: 봇 명령 응답용 /api/* 호출 (쿠키 인증 우회)
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
| `TELEGRAM_HUB_URL` | 선택 | dashboard → hub `/health` 호출 URL. 기본 `http://telegram-hub:3000` |
| `DASHBOARD_URL` | 선택 | hub → dashboard `/api/*` 호출 URL. 기본 `http://dashboard:5000` |

**root 부트스트랩**: 컨테이너 부팅 시 `TELEGRAM_CHAT_ID`를 `hub_users` 에 `role=root` + `car` 권한으로 강제 upsert. dashboard 가 처음 `/v2/tg` 로딩 시 `group_key='root'` 도 자동 매핑.

### `/v2/tg` 페이지 구조

- **인증된 관리자**: 3개 탭
  1. **권한관리** — 가입 대기 / 사용자 그룹 CRUD / 사용자 매트릭스
  2. **알림** — 방송 + 못 알아들은 입력(학습 로그)
  3. **가이드** — 봇 사용법
- **미인증(공개 URL 공유)**: 가이드만 노출.

## 4. RBAC — 역할/권한

### 역할

| role | 의미 |
|---|---|
| `root` | 전권. 모든 명령 + 모든 카테고리 접근 |
| `user` | 승인된 일반 사용자. 부여된 카테고리만 사용 |
| `pending` | 가입 신청 상태. 데이터 명령 사용 불가 (자동 안내) |
| `denied` | 차단됨. 모든 메시지 무시(silent) |

### 두 종류의 그룹

| 종류 | 테이블 | 의미 | 누가 관리 |
|---|---|---|---|
| **기능 그룹** (feature/category) | `hub_categories` | 봇의 명령 묶음 (`car`, `common`, `sns` …) | **개발자만** — `services/telegram-hub/src/categories.js` 시드 + `commands.js` 핸들러 |
| **사용자 그룹** (user group) | `hub_user_groups` | 권한 프리셋 — 어떤 기능 그룹들을 묶어줄지 | **관리자** — `/v2/tg` 의 "권한관리" 탭 |

### 기능 그룹 (개발자 전용)

| key | label | 설명 |
|---|---|---|
| `car` | 🚗 차 | 내 테슬라 상태/위치/충전 |
| `common` | 🧰 공통 | 전 사용자 공용 기능 (예정) |
| `sns` | 💬 SNS | 소셜 발행/예약 (예정) |

신규 기능 그룹 추가 = `categories.js` 시드 + `commands.js` 의 `CATEGORY_COMMANDS` 매핑 + 핸들러 작성. UI 에서는 추가/편집 불가.

### 사용자 그룹 (관리자가 CRUD)

기본 그룹 — **편집/삭제 불가**:

| key | label | 포함 기능 | 비고 |
|---|---|---|---|
| `root` | 👑 Root | * (전체) | `is_root=true` → 코드에서 모든 권한 bypass |
| `guest` | 👋 게스트 | `common` | 일반 사용자 기본값 |

관리자가 추가 그룹을 만들 때: 라벨 + 설명 + 포함 기능 그룹들 multi-select. `is_root` 는 시드 root 만 가능.

**적용 흐름** — 가입 대기 사용자에게 `→ Root` / `→ 게스트` / `→ <custom>` 버튼 클릭:
1. `hub_users.role` 갱신 (`is_root=true` → `root`, 아니면 `user`)
2. `hub_users.group_key` 에 그룹 키 저장
3. `hub_permissions` 트랜잭션으로 비우고 그룹의 feature 들 삽입 (root 그룹은 bypass 라 삽입 생략)

방송도 사용자 그룹 단위 — `/v2/tg` "알림" 탭에서 전체 / Root 그룹 / 게스트 그룹 / 커스텀 그룹 선택.

### 상태 전이

```
       /start (첫 메시지)        /setgroup
   ┌────────────────────► pending ─────────► user ◄──┐
   │                                          │       │ /setgroup
   │                                          │       │
   └─                              /deny      ▼       │
                                            denied ───┘
```

## 5. 명령 레퍼런스

### 데이터 (`car` 권한 필요)

모든 데이터 명령은 dashboard `/api/*` 호출 — TeslaMate DB 직접 쿼리 0.

| 명령 | 설명 | 호출 API |
|---|---|---|
| `/soc` | 배터리 % · 거리 · 충전 상세 (배터리·거리·충전 통합) | `/api/car` + `/api/charging-status` |
| `/period` | 오늘·이번주·저번주·이번달·이전달 (km·전비) — 이번달=최근 4주 롤링 | `/api/summary?range=multi` |
| `/where` | 현재 위치 — 정차/주행 통합 (지도 링크 + 핀) | `/api/parked` + `/api/location` |
| `/places` | 자주가는 곳 / 오래머문 곳 TOP 10 (집·회사 제외, 분기 진입) | `/api/frequent-places` + `/api/long-stay-places` |
| `/chargers` | 즐겨찾기 충전기 가용/사용중 요약 (동별 그룹화) | `/api/home-charger/groups` |
| alias | `/charge` `/range` `/battery` → `/soc`. `/today` `/yesterday` `/week` `/summary` → `/period`. `/parked` → `/where` | — |

**퀵뷰 컨셉**: 봇은 한 화면에 들어오는 짧은 요약. 상세 통계·내역은 대시보드 `/v2/*` 에서.

### 가족 (`family` 권한 필요) — mock

| 명령 | 버튼 | 설명 |
|---|---|---|
| `/weather` | 🌤 오늘 날씨 | 기상청 단기예보 (mock) |
| `/forecast` | 🌧 강수 예보 | 비/눈 사전 알림 (mock) |
| `/event` | 📅 일정 | 일정 등록·조회·반복 + 사전 알림 (mock) |
| `/memo` | 📝 메모 | 가족 공유 메모/장보기 (mock) |

현재 모두 placeholder 응답. 실제 구현은 후속 PR (날씨 → 일정 → 메모 순).

### SNS (`sns` 권한 필요) — mock

| 명령 | 버튼 | 설명 | 호출 API |
|---|---|---|---|
| `/post [본문]` | 📝 글쓰기 | 네이버 블로그 발행 다단계 대화 (mock — 채널 검증용) | `POST /api/sns/blog` |

**다단계 대화 흐름** (`pending.js` + `handlePendingMessage` + `handleSnsCallback`):

```
[📝 글쓰기] 또는 /post (인자 없이)
  ↓ pending 'sns:body' + [❌ 취소] inline
사용자 메시지 (텍스트 / 사진 / 사진+캡션 — 5분 안)
  ↓ pending 'sns:confirm' 으로 전환
📝 발행 미리보기 — 본문 + 사진 흔적
  + [✅ 발행] [✏️ 수정] [❌ 취소] inline
  ↓ [✅ 발행] 누름
POST /api/sns/blog → ✅ 서버 전달 확인됨 (mock)
```

- 사진은 `message.photo` 의 가장 큰 해상도 `file_id` 만 추적. 실제 다운로드/리업로드는 후속 PR.
- `/post 한 줄 본문` 형태로 인자 직접 입력 시 미리보기 단계로 단축.
- 다단계 중에 메인 카테고리 라벨(예: `🚗 차량`) 이나 슬래시 명령 보내면 자동 취소.
- `/api/sns/blog` 는 현재 받기만 하고 콘솔 로그 + `request_id` 반환. 실제 OAuth/발행은 후속 PR.

### 공통 (누구나)

| 명령 | 설명 |
|---|---|
| `/help` | 본인 권한 기준 도움말 (Reply 키보드 동봉) |
| `/whoami` | 이름·역할·권한 (root 만 chat_id 추가 노출) |
| `/categories` | 등록된 카테고리 + 본인 보유 표시(✅/⬜) |
| `/start` | `/help`와 동일 |

### 관리자 (root)

모바일에서 빠르게 처리할 최소 셋만 봇에 둠. 권한 매트릭스·방송·학습로그·사용자 목록은 `/v2/tg` 웹.

| 명령 | 사용법 | 효과 |
|---|---|---|
| `/pending` | — | 가입 대기자 목록 (적용 가이드 포함) |
| `/setgroup <chat_id> <group>` | `/setgroup 123 guest` | 가입승인 또는 그룹변경 — `role` + `group_key` + `hub_permissions` 트랜잭션 갱신 |
| `/deny <chat_id>` | `/deny 123` | 어떤 role이든 → denied (차단/탈퇴) |

## 6. 자연어 라우팅 — 미지원

현재 봇은 **슬래시 명령만** 인식. 자연어 키워드 매칭은 정확도 부족으로 제거됨. 슬래시 외 입력은 `hub_unmatched_inputs` 에 적재 + "잘 모르겠어요 / /help 보기" 응답.

대신 슬래시 진입 부담을 Reply 키보드(카테고리 폴더형)로 낮춤. 텔레그램 입력창 좌측 [/] 자동완성 메뉴는 **사용 안 함** — 슬래시는 채팅창에 직접 입력하면 응답·가이드가 잘 나오므로 좌측 메뉴는 중복.

`syncUserMenu(chatId)` / 부팅 시 `deleteMyCommands()` 호출로 텔레그램 측 [/] 메뉴 비움 (이전 `setMyCommands` 잔재 청소).

### 6-1. Reply 키보드 — 카테고리 폴더형

비IT 가족 친화 + 카테고리 확장성 모두 잡기 위해 **2단 폴더 구조**.

**메인 진입** (`/help` 또는 `⬅️ 메인` 버튼):

```
[🚗 차량]  [🏠 가족]  [📝 SNS]
```

권한 보유한 카테고리만 노출. 누르면 봇이 새 메시지로 **sub-keyboard** 갈아끼움.

**Sub-keyboard** (예: `🚗 차량` 선택 후):

```
[🔋 배터리] [🛣 주행거리] [⚡ 충전]
[📊 오늘]   [📅 어제]    [📆 주간]
[🅿️ 주차]  [📍 위치]
[⬅️ 메인]
```

- 한글 라벨 그대로 봇에 전송 → `BUTTON_TO_CMD` 매핑으로 슬래시 명령 치환 (정확 일치만, 자연어 매칭 X)
- 데이터 명령 응답에는 inline 후속 액션이 별도로 붙음 (Reply 키보드는 갈아끼우지 않고 sub 유지)
- `⬅️ 메인` 누르면 메인 키보드로 복귀

**라우팅 흐름** (`handleMessage`):
1. `⬅️ 메인` → `buildMainKeyboard`
2. 카테고리 라벨 (`🚗 차량` 등 `categories.label` 매칭) → `buildSubKeyboard(catKey)`
3. 한글 명령 라벨 (`🔋 배터리` 등) → `BUTTON_TO_CMD` 슬래시 치환 → 핸들러
4. `/cmd` → 핸들러
5. 그 외 → 폴백

### 6-2. Inline 후속 액션 (데이터 명령 응답)

각 데이터 명령 응답 끝에 `inline_keyboard` 동봉 — 1행 3버튼. 첫 칸은 항상 🔄 (재실행).

| 응답 | 후속 버튼 |
|---|---|
| `/soc` (배터리) | 🔄 / 🛣 거리 / 🔌 충전기 |
| `/range` | 🔄 / 🔋 배터리 / 📊 요약 |
| `/where` | 🔄 / 🗺 가는 곳 / 📊 요약 |
| `/period` (요약) | 🔄 / 🔋 배터리 / 🔌 충전기 |
| `/chargers` | 🔄 / 🔋 배터리 / 📊 요약 |
| `/places` | 🔄 / 📍 위치 / 📊 요약 |

`/places` 는 분기 진입화면 → 자주/오래 종류 선택 후 각 화면에 [🔄] [반대 종류] 버튼 (종류 전환).

- callback_data 포맷: `cmd:<name>` (재실행/인접) · `places:freq|dwell` (종류 전환) · `sns:publish|edit|cancel` (글쓰기 다단계)
- `tg_poller` 가 `callback_query` 분기에서 `handleCallback` 호출 → 라우터 분기
- 매번 새 메시지로 응답 (stateless) — `editMessageText` 인프라는 깔려 있고 향후 in-place 갱신에 사용

### 6-3. 단일 소스

명령 카탈로그: `commands.js` 의 `CATEGORY_COMMANDS` — `/help` 본문, Reply 키보드 (메인/sub) 공유.
후속 액션: `FOLLOWUP` 맵.
한글 라벨 → 슬래시 매핑: `BUTTON_TO_CMD`.

## 6-A. 대시보드 활용도 리포트 (외부 근거자료용)

봇과 별개로 대시보드 `/v2/chargers` 페이지 하단에 인라인 라이브 패널 + 단독 페이지 `/v2/chargers/report` 도 동일 컴포넌트. 단지 외부(관리사무소·확장 제안 등)에 보여주는 자료.

```
┌─ 활용도 리포트 ────────────────────────┐
│ 망포늘푸른벽산 · 관측 N일 · 39기      │
│                                        │
│ ┌─ 전체 가동률 ─┐                      │
│ │   N.N %      │ ← overall_pct        │
│ └──────────────┘                      │
│                                        │
│ 단위    평균    피크                  │
│ 일간    N.N%   N.N%                   │
│ 주간    N.N%   N.N%                   │
│ 월간    N.N%   N.N%                   │
│                                        │
│ 6개월 추세  +N.N %p  ↑ 증가           │
│                                        │
│ [주별 점유율 추이 — 라인+막대 차트]   │
│                                        │
│ 동별 가동률 (⭐=즐겨찾기)             │
│ ⭐ 108동  ████████ N.N%  (2기)        │
│ ⭐ 107동  ████░░░░ N.N%  (2기)        │
│ ...                                    │
│                                        │
│ 🔍 디버그 (raw 응답)  [▾]             │
└────────────────────────────────────────┘
```

**API**: `GET /api/home-charger/report` (1분 자동 폴링)

```
{
  meta: { observation_start, observation_end, days_observed,
          total_chargers, observed_chargers, complex_name },
  kpi: {
    overall_pct,                               // 전체 기간 평균 가동률
    daily_avg_pct, daily_peak_pct,             // 일별 가동률 평균/최대
    weekly_avg_pct, weekly_peak_pct,           // 주별 (월요일 시작)
    monthly_avg_pct, monthly_peak_pct,         // 월별 (캘린더)
    trend_6m_delta_pp,                         // 최근 6달 평균 - 직전 6달 평균
  },
  weekly: [{ w_start, label('MM/DD'), sessions, days, occupancy_pct }],
  by_dong: [{ key, title, favorite, total, sessions, occupancy_pct }],
}
```

**산식**:
- 가동률 % = `SUM(count) / (chargers × days × 48) × 100` (30분 슬롯 정규화)
- 일별 가동률 = 그 날 가동률 (chargers × 48 분모)
- 주별 / 월별 = 그 단위 가동률, JS 에서 row 별 % 계산 후 평균/최대
- 동별 가동률 = `constants.js` (P1·P2·P3 매핑) 기준 동별 합산

**단일 진실원**:
- 충전기 등록 갯수 → 환경공단 API 캐시 (`getCache().data.stations`)
- 동별 그룹 매핑 → `app/v2/battery/home-charger/constants.js`
- 봇 `/chargers` 의 그룹 카운트도 같은 정의 사용 (`/api/home-charger/groups`)

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

### 와이프 추가하고 게스트 그룹으로 가입

```
와이프: 봇한테 "hi" 또는 /start
       ← "가입 신청 접수됨"
본인 (root에게 자동 푸시):
  🔔 신규 가입 신청 #9999 김와이프
  적용: /setgroup 9999 guest
        /setgroup 9999 root
  거부: /deny 9999
본인: /setgroup 9999 guest    ← guest 그룹의 features=['common'] 일괄 적용
와이프: /soc                  ← "🔒 'car' 권한이 필요해요"
와이프: /help                 ← guest 그룹 기준 도움말
```

커스텀 그룹이 필요하면 `/v2/tg` "권한관리" 탭에서 그룹 만들고 적용.

### 모르는 사람 차단

```
낯선 사람: 봇한테 메시지
본인: /pending → #5555 stranger
본인: /deny 5555
       → 이후 그 사람 메시지 silent 처리
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
    ├── categories.js   — 카테고리 DB 조회 + 5s TTL 캐시 (hub_categories)
    ├── commands.js     — 명령 라우팅 + 핸들러
    ├── tg_poller.js    — Telegram getUpdates long-poll
    ├── poller.js       — TeslaMate DB 폴링 → 알림 broadcast
    ├── notify.js       — HTTP 서버 (/health, /notify)
    ├── telegram.js     — Telegram API 래퍼
    ├── db.js           — pg pool
    ├── state.js        — /data/state.json IO
    └── format.js       — KST 시각/duration 포맷
```
