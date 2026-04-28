// 집충전기 카드 상수 — ID 매핑, 스테이션/동 배치, 상태 메타

// 메인 스테이션 (P1/P2 우선순위 적용 대상)
export const MAIN_STATION_ID = 'PI795111';

// 폴링 / 클럭 주기
export const POLL_INTERVAL_MS = 60_000;   // 클라이언트 API 폴링
export const CLOCK_INTERVAL_MS = 1_000;   // 경과시간 갱신용 tick

// 상태 배지 표시 순서 (대기 > 충전중 > 점검중 > 통신이상 > 운영중지 > 확인불가)
export const STATUS_ORDER = ['2', '3', '5', '1', '4', '9'];

export const ID_OFFSET = 95110; // chgerId + 95110 = 차지비 앱 ID

// P1 (1순위): 108동 앞 · 107동 앞
export const P1_108_IDS = ['04', '05'];                          // 앱 번호 14, 15
export const P1_107_IDS = ['12', '13'];                          // 앱 번호 22, 23
// P2 (2순위): 102동 앞 · 104동 앞
export const P2_102_IDS = ['06', '07', '08', '09', '10', '11'];  // 앱 번호 16~21
export const P2_104_IDS = ['14', '15', '16'];                    // 앱 번호 24, 25, 26
// P3 (참고 그룹): PI795111 내 동별 분류
export const P3_105_IDS = ['17', '18', '19'];                    // 105동 앞 — 앱 번호 27, 28, 29
export const P3_115_IDS = ['01', '02', '03'];                    // 115동 지상 — 앱 번호 11, 12, 13
export const P3_111_IDS = ['20', '21', '22'];                    // 111동 앞 — 앱 번호 30, 31, 32
export const P3_117_IDS = ['23', '24', '25'];                    // 117동 앞 — 앱 번호 33, 34, 35

export const PRIORITY_IDS = new Set([
  ...P1_108_IDS, ...P1_107_IDS, ...P2_102_IDS, ...P2_104_IDS,
]);

// P3 섹션에서 동별로 분리해 표시할 단일-스테이션 그룹 (타일 형식)
// 115동은 지상(PI795111)과 지하(PI313299) 교차 스테이션이라 별도 합성 렌더
// 순서 = 더보기 펼침 시 화면 노출 순서 (우선순위 높음 → 낮음)
export const P3_GROUPS = [
  { title: '105', ids: P3_105_IDS },
  { title: '111', ids: P3_111_IDS },
  { title: '117', ids: P3_117_IDS },
];
export const P3_GROUPED_IDS = new Set([
  ...P3_GROUPS.flatMap(g => g.ids),
  ...P3_115_IDS, // 115동 지상도 mainLeftover에서 제외 (별도 115동 타일에서 렌더)
]);

// 115동 지하 스테이션 ID (지상과 묶어 한 타일로 표시)
export const STATION_115_UNDERGROUND = 'PI313299';

// 119동 앞 — 충전기 수가 많아 grid에서 2칸을 차지하도록 처리
export const STATION_119F = 'PIH01089';

export const COMPLEX_NAME = '망포늘푸른벽산아파트';

export const STATION_CONFIG = {
  'PI795111': { loc: null,      label: 'PI795111' },
  'PI313299': { loc: '115 B1',  label: '115(지하)' },
  'PIH01089': { loc: '119F',    label: '119 앞' },
};

// 환경공단 API 상태 코드별 UI 메타
// dot/text: 헤더 상태 배지용 (saturated)
// border:   셀 외곽선 (파스텔)
// body:     셀 본체 bg (상태 색 옅게 — 비충전 셀 시각 강도 보강)
// num:      셀 번호 색 (상태 색 — 충전중만 zinc-100, fill 위 가독성)
// fill:     셀 inner fill (충전중에만, 14h max scale)
export const STAT_META = {
  '2': { label: '대기',     dot: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-300',     body: 'bg-emerald-300/15', num: 'text-emerald-300' },
  '3': { label: '충전중',   dot: 'bg-blue-500',    text: 'text-blue-400',    border: 'border-sky-300',         body: 'bg-sky-300/[0.04]', num: 'text-zinc-100', fill: 'bg-sky-300/40' },
  '4': { label: '운영중지', dot: 'bg-zinc-600',    text: 'text-zinc-400',    border: 'border-slate-400/40',    body: 'bg-slate-400/10',   num: 'text-slate-200' },
  '5': { label: '점검중',   dot: 'bg-amber-500',   text: 'text-amber-400',   border: 'border-yellow-200',      body: 'bg-yellow-200/15',  num: 'text-yellow-200' },
  '1': { label: '통신이상', dot: 'bg-rose-500',    text: 'text-rose-400',    border: 'border-rose-300',        body: 'bg-rose-300/15',    num: 'text-rose-300' },
  '9': { label: '확인불가', dot: 'bg-zinc-700',    text: 'text-zinc-500',    border: 'border-slate-400/30',    body: 'bg-slate-400/[0.06]', num: 'text-slate-300' },
};
