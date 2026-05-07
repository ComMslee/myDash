# 한국환경공단 전기자동차 충전소 정보 API

대시보드에 공공 전기차 충전소 위치/상태 오버레이를 추가할 때 사용 가능한 공공데이터 API. 2026-04-20 실호출로 동작 검증 완료.

## 기본 정보

| 항목 | 값 |
|---|---|
| 데이터셋 | 한국환경공단_전기자동차 충전소 정보 |
| 공공데이터포털 ID | `15076352` |
| End Point | `https://apis.data.go.kr/B552584/EvCharger` |
| 포맷 | XML |
| 갱신 | 실시간 |
| 비용 | 무료 |
| 개발계정 트래픽 | 오퍼레이션당 1,000회/일 |
| 활용기간 | 2026-04-20 ~ 2028-04-20 |

## 인증키 보관

`serviceKey`는 코드에 하드코딩 금지. `.env.local` 또는 docker-compose env에 저장:

```
EV_CHARGER_API_KEY=<decoding 키>
```

포털 제공 **Decoding 키**를 사용하고 `requests`/`fetch`에 그대로 넘기면 자동 인코딩됨.

## ⚠️ 호출 시 필수 조건 (실호출로 확인된 함정)

1. **HTTPS 필수** — `http://`는 401 Unauthorized
2. **User-Agent 헤더 필수** — 기본 UA(`curl/*`, Node 기본 등)는 게이트웨이 차단. `Mozilla/5.0` 등 아무 값이라도 지정
3. **`numOfRows` 최소 10** — 그보다 작게 보내도 서버가 10으로 강제

## 오퍼레이션

| 오퍼레이션 | 용도 | 응답 필드 요약 |
|---|---|---|
| `getChargerInfo` | 충전소/충전기 **정적 정보** | statNm, statId, chgerId, chgerType, addr, lat, lng, useTime, output(kW), busiNm, parkingFree, zcode, maker |
| `getChargerStatus` | 충전기 **실시간 상태** | statId, chgerId, stat, statUpdDt, lastTsdt, lastTedt, nowTsdt |

## 요청 파라미터

| 파라미터 | 필수 | 예시 | 설명 |
|---|---|---|---|
| `serviceKey` | ● | 발급키 | Decoding 키 |
| `pageNo` | ● | 1 | 페이지 번호 |
| `numOfRows` | ● | 100 | 10~9999 |
| `zcode` | ○ | 11 | 시도코드(행정구역코드 앞 2자리). 서울=11, 부산=26, 경기=41 등 |
| `period` | ○ | 5 | (Status 전용) 상태갱신 조회 범위(분), 기본 5 |

## 상태 코드 (`stat`)

`1` 통신이상 · `2` 충전대기 · `3` 충전중 · `4` 운영중지 · `5` 점검중 · `9` 상태미확인

## 충전기 타입 코드 (`chgerType`) — 주요값

`01` DC차데모 · `02` AC완속 · `03` DC차데모+AC3상 · `04` DC콤보 · `05` DC차데모+DC콤보 · `06` DC차데모+AC3상+DC콤보 · `07` AC3상 · `08` DC콤보(완속)

## Next.js API 라우트 예시

```js
// app/api/ev-chargers/route.js
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const zcode = searchParams.get('zcode') ?? '11';
  const url = new URL('https://apis.data.go.kr/B552584/EvCharger/getChargerInfo');
  url.searchParams.set('serviceKey', process.env.EV_CHARGER_API_KEY);
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', '1000');
  url.searchParams.set('zcode', zcode);

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    cache: 'no-store',
  });
  const xml = await res.text();
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
}
```

## 실호출 검증 결과 (2026-04-20 기준)

- `getChargerStatus?zcode=11` → `resultCode=00`, totalCount **1,221**
- `getChargerInfo?zcode=11` → `resultCode=00`, totalCount **73,565** (전국 기준으로 반환됨 — zcode 필터 적용은 항목 레벨에서 확인 필요)
- 첫 항목 예: 낙성대동주민센터 (`ME174013`), 서울 관악구 낙성대로4가길 5, 37.476296/126.9583876, 50kW AC3상

## 참고 문서

- 공공데이터포털: <https://www.data.go.kr/data/15076352/openapi.do>
- 활용가이드: `한국환경공단_전기자동차 충전소 정보_OpenAPI활용가이드_v1.23.docx` (포털에서 다운로드)
