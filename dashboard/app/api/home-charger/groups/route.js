import { requireAuth } from '@/lib/auth-helper';
import {
  getCache, isFresh, isQuotaCooldown, warmIfNeeded, getLastError,
} from '@/lib/home-charger-cache';
import {
  P1_108_IDS, P1_107_IDS, P2_102_IDS, P2_104_IDS,
  P3_105_IDS, P3_111_IDS, P3_117_IDS, P3_115_IDS,
  STATION_115_UNDERGROUND, STATION_119F, MAIN_STATION_ID,
} from '@/app/v2/battery/home-charger/constants';

export const dynamic = 'force-dynamic';

// 환경공단 충전기를 대시보드와 동일한 동별 그룹으로 묶어 카운트.
// 봇 /chargers 의 퀵뷰용 — chgerId 매핑은 constants.js 단일 진실원.

const GROUPS = [
  // P1·P2 = 즐겨찾기. 대시보드 카드에서 ⭐ 로 표시되는 4개.
  { key: '108', title: '108동',   favorite: true,  parts: [{ statId: MAIN_STATION_ID, ids: P1_108_IDS }] },
  { key: '107', title: '107동',   favorite: true,  parts: [{ statId: MAIN_STATION_ID, ids: P1_107_IDS }] },
  { key: '102', title: '102동',   favorite: true,  parts: [{ statId: MAIN_STATION_ID, ids: P2_102_IDS }] },
  { key: '104', title: '104동',   favorite: true,  parts: [{ statId: MAIN_STATION_ID, ids: P2_104_IDS }] },
  // P3 참고. 115는 지상(메인) + 지하(별도 statId) 합산.
  { key: '105', title: '105동',   favorite: false, parts: [{ statId: MAIN_STATION_ID, ids: P3_105_IDS }] },
  { key: '111', title: '111동',   favorite: false, parts: [{ statId: MAIN_STATION_ID, ids: P3_111_IDS }] },
  { key: '117', title: '117동',   favorite: false, parts: [{ statId: MAIN_STATION_ID, ids: P3_117_IDS }] },
  { key: '115', title: '115동',   favorite: false, parts: [
    { statId: MAIN_STATION_ID, ids: P3_115_IDS },
    { statId: STATION_115_UNDERGROUND, ids: '*' },
  ] },
  { key: '119', title: '119동 앞', favorite: false, parts: [
    { statId: STATION_119F, ids: '*' },
  ] },
];

export async function GET() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;

  const c = getCache();
  if (!c.data) {
    if (!isQuotaCooldown()) warmIfNeeded().catch(() => {});
    return Response.json({ error: 'no_cache_yet' }, { status: 503 });
  }
  if (!isFresh() && !isQuotaCooldown()) {
    warmIfNeeded().catch(() => {});
  }

  const stale = !isFresh();
  const stationsById = new Map((c.data.stations || []).map((s) => [s.station.statId, s.chargers || []]));

  const groups = GROUPS.map((g) => {
    let total = 0, available = 0, using = 0, offline = 0, maintain = 0;
    for (const p of g.parts) {
      const chargers = stationsById.get(p.statId) || [];
      const filtered = p.ids === '*' ? chargers : chargers.filter((c) => p.ids.includes(c.chgerId));
      for (const c of filtered) {
        total++;
        if      (c.stat === '2') available++;
        else if (c.stat === '3') using++;
        else if (c.stat === '1') offline++;
        else if (c.stat === '4' || c.stat === '5' || c.stat === '9') maintain++;
      }
    }
    return { key: g.key, title: g.title, favorite: g.favorite, total, available, using, offline, maintain };
  });

  return Response.json({
    groups,
    fetchedAt: c.data.fetchedAt,
    stale,
    lastError: stale ? getLastError() : null,
  });
}
