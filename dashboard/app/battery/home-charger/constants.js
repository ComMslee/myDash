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

export const PRIORITY_IDS = new Set([
  ...P1_108_IDS, ...P1_107_IDS, ...P2_102_IDS, ...P2_104_IDS,
]);

// P3 섹션에서 동별로 분리해 표시할 단일-스테이션 그룹 (타일 형식)
// 115동은 지상(PI795111)과 지하(PI313299) 교차 스테이션이라 별도 합성 렌더
export const P3_GROUPS = [
  { title: '105동', ids: P3_105_IDS },
];
export const P3_GROUPED_IDS = new Set([
  ...P3_GROUPS.flatMap(g => g.ids),
  ...P3_115_IDS, // 115동 지상도 mainLeftover에서 제외 (별도 115동 타일에서 렌더)
]);

// 115동 지하 스테이션 ID (지상과 묶어 한 타일로 표시)
export const STATION_115_UNDERGROUND = 'PI313299';

export const COMPLEX_NAME = '망포늘푸른벽산아파트';

export const STATION_CONFIG = {
  'PI795111': { loc: null,      label: 'PI795111' },
  'PI313299': { loc: '115 B1',  label: '115동(지하)' },
  'PIH01089': { loc: '119F',    label: '119동 앞' },
};

// 환경공단 API 상태 코드별 UI 메타
export const STAT_META = {
  '2': { label: '대기',     dot: 'bg-emerald-500', text: 'text-emerald-400', cellBg: 'bg-emerald-500/80', cellText: 'text-white' },
  '3': { label: '충전중',   dot: 'bg-blue-500',    text: 'text-blue-400',    cellBg: 'bg-blue-500/80',    cellText: 'text-white' },
  '4': { label: '운영중지', dot: 'bg-zinc-600',    text: 'text-zinc-400',    cellBg: 'bg-zinc-700/70',    cellText: 'text-zinc-300' },
  '5': { label: '점검중',   dot: 'bg-amber-500',   text: 'text-amber-400',   cellBg: 'bg-amber-500/80',   cellText: 'text-white' },
  '1': { label: '통신이상', dot: 'bg-rose-500',    text: 'text-rose-400',    cellBg: 'bg-rose-500/80',    cellText: 'text-white' },
  '9': { label: '확인불가', dot: 'bg-zinc-700',    text: 'text-zinc-500',    cellBg: 'bg-zinc-800',       cellText: 'text-zinc-500' },
};
