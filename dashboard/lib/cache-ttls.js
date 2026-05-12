// 분석 라우트 server-cache TTL 정책 단일 소스.
// 라우트별 freshness 요구에 따라 카테고리 적용. 정책 변경 시 여기만 수정.
//
// 사용: import { TTL_300S } from '@/lib/cache-ttls';
//       return Response.json(await withCache(`x:${id}`, TTL_300S, async () => ({...})));

/** 120s — 봇 /period 단기 historical 범위 (summary multi/last-week 등) */
export const TTL_120S = 120_000;

/** 180s — 배터리/충전 목록류 (battery, fast-charges, slow-charges) */
export const TTL_180S = 180_000;

/** 300s — 월별/랭킹/장소/히트맵 (사전집계 위임 라우트 중간 정책) */
export const TTL_300S = 300_000;

/** 600s — 12개월 인사이트/전기간/배터리 추이 (가장 무거운 사전집계 의존) */
export const TTL_600S = 600_000;
