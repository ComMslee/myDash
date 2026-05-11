# 한국관광공사 TourAPI 4.0 (관광정보 서비스)

가족 봇의 `🎉 축제` 기능 데이터 소스. 행사/공연/축제 목록을 기간·지역으로 조회.

## 기본 정보

| 항목 | 값 |
|---|---|
| 데이터셋 | 한국관광공사_국문 관광정보 서비스 |
| 공공데이터포털 ID | `B551011/KorService2` |
| End Point | `https://apis.data.go.kr/B551011/KorService2` |
| 포맷 | JSON (`_type=json`) / XML |
| 갱신 | 한국관광공사 등록 기준 |
| 비용 | 무료 |
| 인증키 | data.go.kr 활용신청 (자동 승인) |

## 인증키 보관

`serviceKey`는 코드 하드코딩 금지. `.env` 또는 docker-compose env에 저장:

```
TOUR_API_KEY=<decoding 키>
```

포털 제공 **Decoding 키**를 사용. `URLSearchParams.set()` 또는 `fetch` 가 자동 인코딩.

## ⚠️ 호출 시 필수 조건 (EV_CHARGER_API 와 동일 함정)

1. **HTTPS 필수**
2. **User-Agent 헤더 필수** — Node 기본 UA 가 게이트웨이에서 차단될 수 있음. `Mozilla/5.0` 등 임의 값 지정.
3. **`MobileOS`, `MobileApp` 파라미터 필수** — 누락 시 결과 0건 또는 에러.

## 오퍼레이션 (이 프로젝트에서 사용)

| 오퍼레이션 | 용도 | 응답 필드 요약 |
|---|---|---|
| `searchFestival2` | 기간·지역 축제 목록 | contentid, title, eventstartdate, eventenddate, addr1/2, areacode, mapx, mapy, firstimage, tel |
| `detailIntro2` | 상세 (개요·이용시간·주최) | overview, eventplace, sponsor1, usetimefestival 등 (현재 미사용) |

## 요청 파라미터 — `searchFestival2`

| 파라미터 | 필수 | 예시 | 설명 |
|---|---|---|---|
| `serviceKey`     | ● | 발급키 | Decoding 키 |
| `MobileOS`       | ● | `ETC` | `IOS`/`AND`/`WIN`/`ETC` |
| `MobileApp`      | ● | `YeHome` | 앱 식별자 (임의) |
| `_type`          | ○ | `json` | 미지정 시 XML |
| `numOfRows`      | ○ | 10 | 1~100 |
| `pageNo`         | ○ | 1 | 페이지 |
| `arrange`        | ○ | `A` | A=제목, C=수정일, D=생성일, R=권장(이미지순) |
| `eventStartDate` | ● | YYYYMMDD | 개최 시작일 (지정일 이후 시작 또는 진행 중인 축제) |
| `eventEndDate`   | ○ | YYYYMMDD | 개최 종료일 |
| `areaCode`       | ○ | `1` | 광역지자체 |
| `sigunguCode`    | ○ | `1` | `areaCode` 와 함께 사용 |

## 지역 코드 (`areaCode`)

| 코드 | 지역 | 코드 | 지역 |
|---|---|---|---|
| 1  | 서울 | 31 | 경기 |
| 2  | 인천 | 32 | 강원 |
| 3  | 대전 | 33 | 충북 |
| 4  | 대구 | 34 | 충남 |
| 5  | 광주 | 35 | 경북 |
| 6  | 부산 | 36 | 경남 |
| 7  | 울산 | 37 | 전북 |
| 8  | 세종 | 38 | 전남 |
|    |      | 39 | 제주 |

## 응답 구조 (JSON)

```json
{
  "response": {
    "header": { "resultCode": "0000", "resultMsg": "OK" },
    "body": {
      "items": {
        "item": [
          {
            "contentid": "1234567",
            "title": "○○ 봄 축제",
            "eventstartdate": "20260503",
            "eventenddate": "20260505",
            "addr1": "서울특별시 성동구 ...",
            "addr2": "성수동",
            "areacode": "1",
            "sigungucode": "5",
            "mapx": "127.0428",
            "mapy": "37.5447",
            "firstimage": "http://.../orig.jpg",
            "firstimage2": "http://.../thumb.jpg",
            "tel": "02-..."
          }
        ]
      },
      "totalCount": 42,
      "numOfRows": 10,
      "pageNo": 1
    }
  }
}
```

⚠️ `items.item` 이 결과 1건이면 **객체 1개**(배열 아님)로 응답. 정규화 시 `Array.isArray` 분기 필요.

## 본 프로젝트 라우트 — `dashboard /api/family/festivals`

```
GET  /api/family/festivals?from=YYYYMMDD&to=YYYYMMDD&areaCode=1&size=20
POST /api/family/festivals/refresh   (HUB_SHARED_SECRET 인증)
```

**아키텍처** — TourAPI 직접 호출 X. `family_festivals` Postgres 테이블만 SELECT.

```
GHA cron (월·수·금 03:00 KST) ──POST /refresh──► TourAPI (오늘~+90일, 전국)
                                                    │
                                                    ▼
                              upsertMany() + cleanupExpired()
                                                    │
                                                    ▼
                                       family_festivals 테이블
                                                    ▲
                              GET /api/family/festivals (DB SELECT 만)
                                                    │
                                       ├─ 봇 /festivals
                                       └─ dashboard UI
```

- 폴링 워크플로: `.github/workflows/refresh-festivals.yml`
- stale 임계: 4일 (마지막 `fetched_at` 기준 — 폴링 주 3회라 4일 이상이면 stale 표시)
- `from`/`to` 미지정 시 `오늘 ~ +30일` (KST).
- `areaCode` 미지정 시 전국.
- 응답: `{ festivals: [...정규화...], totalCount, fetchedAt, stale }`
- 정규화 필드: `id, title, startDate, endDate, addr, areaCode, sigunguCode, lat, lng, image, thumbnail, tel`.

> 외부 API 직접 호출은 `/refresh` 한 곳뿐 — TourAPI 장애가 GET 라우트에 전파되지 않는다. 대시보드/봇은 항상 DB 의 가장 최근 스냅샷을 본다. 테이블 스키마는 [`DATABASE.md`](./DATABASE.md#대시보드가-생성하는-테이블) 참조.

## 봇 통합 — `/festivals` (가족 카테고리)

- `/festivals` — 한 달 + 사용자 기본 지역(미설정 시 전국)
- `/festivals weekend` — 이번 주말
- `/festivals 서울` — 한 달 + 서울 (override)
- `/festivals weekend 부산` — 주말 + 부산
- `/festivals 전국` — 한 달 + 전국 (default 무시)

기본 지역 설정: `/setarea 서울` · 해제: `/setarea 전국`. 컬럼: `hub_users.default_area_code`.

## 참고 문서

- 공공데이터포털: <https://www.data.go.kr/data/15101578/openapi.do>
- 활용가이드: 공공데이터포털 페이지에서 다운로드
