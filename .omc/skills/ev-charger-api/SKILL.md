---
name: ev-charger-api
description: 환경공단 전기자동차 충전소 정보 API (https://apis.data.go.kr/B552584/EvCharger) 사용 시 공식 가이드 참조 및 올바른 파라미터/인증키/응답 파싱 적용
triggers:
  - EvCharger
  - apis.data.go.kr/B552584
  - 환경공단
  - ev-charger
  - 충전소 api
  - getChargerInfo
  - EV_CHARGER_API_KEY
argument-hint: "[operation]"
---

# EV Charger API Skill

## Purpose

한국환경공단 전기자동차 충전소 정보 OpenAPI를 사용할 때 공식 가이드를 참조하여 올바르게 구현한다.

## When to Activate

다음 키워드가 포함될 때 자동 활성화:
- `https://apis.data.go.kr/B552584/EvCharger`
- `getChargerInfo`, `EV_CHARGER_API_KEY`
- 환경공단 충전소 API 관련 코드 작성/수정

## 참고 문서

**항상 아래 문서를 먼저 읽고 구현할 것:**

1. **공식 가이드 (우선):** `docs/한국환경공단_전기자동차 충전소 정보_OpenAPI활용가이드_v1.23.docx`
2. **프로젝트 요약:** `docs/EV_CHARGER_API.md`

## 핵심 구현 사항

### 인증키
- 환경변수: `EV_CHARGER_API_KEY` (64-hex 일반 인증키)
- `serviceKey` 파라미터로 전달 (URL 인코딩 주의)

### 주요 오퍼레이션
- `getChargerInfo` — 충전기 목록 조회
- `getChargerStatus` — 실시간 충전기 상태

### 필수 파라미터 패턴
```js
const url = new URL('https://apis.data.go.kr/B552584/EvCharger/getChargerInfo');
url.searchParams.set('serviceKey', process.env.EV_CHARGER_API_KEY);
url.searchParams.set('pageNo', '1');
url.searchParams.set('numOfRows', '9999');
url.searchParams.set('zcode', '41'); // 경기도
// 선택: statId, statNm, addr 등으로 필터링
```

### fetch 시 필수 헤더
```js
fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
```

### XML 응답 파싱
```js
const get = (tag, body) => {
  const r = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(body);
  return r ? r[1].trim() : '';
};
```

### 페이지네이션
- `numOfRows` 최대 9999, 여러 페이지 순회 필요
- 빈 `<items/>` 또는 items 없으면 마지막 페이지

### 주요 응답 필드
| 필드 | 설명 |
|------|------|
| `statId` | 스테이션 ID |
| `statNm` | 스테이션 이름 |
| `chgerId` | 충전기 ID |
| `addr` | 주소 |
| `lat` / `lng` | 좌표 |
| `output` | 출력(kW) |
| `stat` | 충전기 상태 (1:통신이상, 2:충전가능, 3:충전중, 4:운영중지, 5:점검중, 9:상태미확인) |

### zcode (시도 코드)
| 코드 | 지역 |
|------|------|
| 11 | 서울 |
| 41 | 경기 |
| 48 | 경남 |
| (전체 목록은 가이드 문서 참조) |

## Workflow

1. `docs/한국환경공단_전기자동차 충전소 정보_OpenAPI활용가이드_v1.23.docx` 읽기
2. 필요한 오퍼레이션/파라미터 확인
3. `EV_CHARGER_API_KEY` 환경변수 사용
4. User-Agent 헤더 반드시 포함
5. XML 파싱 후 필드 추출

## Gotchas

- **HTTPS 필수** — HTTP로 호출 시 실패
- **User-Agent 없으면 차단** — 반드시 `Mozilla/5.0` 포함
- **numOfRows 누락 시** 기본값이 작음 → 항상 명시
- **statId 단독 필터 안됨** — zcode와 함께 사용해야 정상 응답
- **좌표(lat/lng) 없는 스테이션** 존재 — null 체크 필수
