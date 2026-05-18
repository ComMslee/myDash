# 집충전기 활용도 리포트

단지 충전기 활용도를 한 화면 요약으로 보여주는 외부 근거자료 (관리사무소·확장 제안 등). 봇과는 무관 — 대시보드 단독 기능.

## 페이지

- **`/v2/chargers`** — 하단 인라인 라이브 패널
- **`/v2/chargers/report`** — 단독 페이지 (외부 캡처/공유)

두 위치 모두 `dashboard/app/v2/chargers/_parts/ReportPanel.js` 단일 컴포넌트 재사용.

## 레이아웃

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

## API

**`GET /api/home-charger/report`** (1분 자동 폴링)

```jsonc
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

## 산식

- 가동률 % = `SUM(count) / (chargers × days × 48) × 100` (30분 슬롯 정규화)
- 일별 가동률 = 그 날 가동률 (chargers × 48 분모)
- 주별 / 월별 = 그 단위 가동률, JS 에서 row 별 % 계산 후 평균/최대
- 동별 가동률 = `constants.js` (P1·P2·P3 매핑) 기준 동별 합산

## 단일 진실원

- 충전기 등록 갯수 → 환경공단 API 캐시 (`getCache().data.stations`)
- 동별 그룹 매핑 → `dashboard/app/v2/battery/home-charger/constants.js`
- 봇 `/chargers` 의 그룹 카운트도 같은 정의 사용 (`/api/home-charger/groups`)
