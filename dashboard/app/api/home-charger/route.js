import {
  fetchUsageDb,
  getCache,
  getLastError,
  getQuotaCooldownUntil,
  getStatIds,
  isFresh,
  isQuotaCooldown,
  loadStations,
  recordUsageDb,
  setCache,
  warmIfNeeded,
} from '@/lib/home-charger-cache';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const key = process.env.EV_CHARGER_API_KEY;
  if (!key) {
    return Response.json({ error: 'EV_CHARGER_API_KEY 미설정' }, { status: 503 });
  }
  const statIds = getStatIds();
  const { searchParams } = new URL(req.url);
  const force = searchParams.get('refresh') === '1';

  if (force) {
    let upstreamError = null;
    try {
      const stations = await loadStations(statIds, key);
      if (stations.length) {
        await recordUsageDb(stations);
        const usage = await fetchUsageDb(stations.map(s => s.station.statId));
        const payload = { stations, fetchedAt: new Date().toISOString(), usage };
        setCache(payload);
        return Response.json(payload);
      }
      upstreamError = `스테이션 매칭 없음 (요청 ${statIds.join(',')})`;
    } catch (e) {
      upstreamError = e.message || '조회 실패';
      console.error('[home-charger] upstream error:', upstreamError);
    }
    const c = getCache();
    if (c.data) return Response.json({ ...c.data, stale: true, lastError: upstreamError });
    return Response.json({ error: upstreamError || '조회 실패' }, { status: 500 });
  }

  const cache = getCache();
  if (cache.data) {
    if (!isFresh() && !isQuotaCooldown()) {
      warmIfNeeded().catch(e => console.warn('[home-charger] bg warm failed:', e.message));
    }
    const stale = !isFresh();
    const body = stale ? { ...cache.data, stale: true } : cache.data;
    const err = getLastError();
    if (stale && err) body.lastError = err;
    if (isQuotaCooldown()) body.quotaCooldownUntil = getQuotaCooldownUntil();
    return Response.json(body);
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const payload = await warmIfNeeded();
      if (payload) return Response.json(payload);
    } catch (e) {
      console.error(`[home-charger] cold load attempt ${attempt + 1} failed:`, e.message);
    }
    const c = getCache();
    if (c.data) return Response.json(c.data);
    if (isQuotaCooldown()) break; // 쿠다운 중이면 더 시도 무의미
    if (attempt < 2) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
  }
  const err = getLastError();
  return Response.json(
    {
      error: err || '스테이션을 찾지 못했습니다.',
      statIds,
      ...(isQuotaCooldown() ? { quotaCooldownUntil: getQuotaCooldownUntil() } : {}),
    },
    { status: 404 }
  );
}
