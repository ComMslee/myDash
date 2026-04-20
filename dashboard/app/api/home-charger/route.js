import {
  cacheTtlMs,
  getCache,
  isFresh,
  loadStation,
  setCache,
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
  const cache = getCache();
  if (!force && isFresh()) {
    return Response.json(cache.data);
  }
  try {
    const { station, chargers } = await loadStation(statId, key);
    if (station && chargers.length) {
      const payload = { station, chargers, fetchedAt: new Date().toISOString() };
      setCache(payload);
      return Response.json(payload);
    }
    if (cache.data) {
      console.warn('[home-charger] station not found, serving stale cache');
      return Response.json({ ...cache.data, stale: true });
    }
    return Response.json({ error: '스테이션을 찾지 못했습니다.' }, { status: 404 });
  } catch (e) {
    console.error('[home-charger] upstream error:', e.message);
    if (cache.data) {
      return Response.json({ ...cache.data, stale: true });
    }
    return Response.json({ error: e.message || '조회 실패' }, { status: 500 });
  }
}
