import {
  getCache,
  isFresh,
  loadStation,
  setCache,
  warmIfNeeded,
} from '@/lib/home-charger-cache';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const key = process.env.EV_CHARGER_API_KEY;
  const statId = process.env.HOME_CHARGER_STAT_ID || 'PI795111';
  if (!key) {
    return Response.json({ error: 'EV_CHARGER_API_KEY 미설정' }, { status: 503 });
  }
  const { searchParams } = new URL(req.url);
  const force = searchParams.get('refresh') === '1';

  // 강제 갱신: 동기 페치 (사용자가 버튼 누름)
  if (force) {
    try {
      const { station, chargers } = await loadStation(statId, key);
      if (station && chargers.length) {
        const payload = { station, chargers, fetchedAt: new Date().toISOString() };
        setCache(payload);
        return Response.json(payload);
      }
    } catch (e) {
      console.error('[home-charger] upstream error:', e.message);
    }
    const c = getCache();
    if (c.data) return Response.json({ ...c.data, stale: true });
    return Response.json({ error: '조회 실패' }, { status: 500 });
  }

  // SWR: 캐시가 있으면 즉시 응답, 만료됐으면 백그라운드에서 갱신
  const cache = getCache();
  if (cache.data) {
    if (!isFresh()) {
      warmIfNeeded().catch(e => console.warn('[home-charger] bg warm failed:', e.message));
    }
    return Response.json(isFresh() ? cache.data : { ...cache.data, stale: true });
  }

  // 콜드 스타트(캐시 비어있음): warm inflight를 공유해 최대 3회 재시도
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const payload = await warmIfNeeded();
      if (payload) return Response.json(payload);
    } catch (e) {
      console.error(`[home-charger] cold load attempt ${attempt + 1} failed:`, e.message);
    }
    // 이미 다른 요청이 채워뒀다면 즉시 사용
    const c = getCache();
    if (c.data) return Response.json(c.data);
    if (attempt < 2) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
  }
  return Response.json({ error: '스테이션을 찾지 못했습니다.' }, { status: 404 });
}
