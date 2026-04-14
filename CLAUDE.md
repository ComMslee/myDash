# TeslaMate Custom Dashboard

## 배포

코드 수정 후 항상 서버에 즉시 반영한다:

```bash
docker-compose build dashboard && docker-compose up -d dashboard
```

## 프로젝트 구조

- `dashboard/` — Next.js 14 앱 (App Router)
- `dashboard/app/api/` — API 라우트 (PostgreSQL 직접 쿼리)
- `dashboard/app/` — 페이지별 컴포넌트
- DB: TeslaMate PostgreSQL (tables: drives, charging_processes, positions, states, addresses, cars)

## 상수

- `lib/constants.js` — KWH_PER_KM, RATED_RANGE_MAX_KM 등
- `lib/db.js` — PostgreSQL 커넥션 풀

## 규칙

- 한국어 UI
- 다크 테마 (#0f0f0f 배경, #161618 카드)
- 모바일 우선, PC 2열 / 모바일 1열
- KST(UTC+9) 기준 날짜/시간 처리
