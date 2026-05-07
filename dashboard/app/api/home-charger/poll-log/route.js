import { fetchPollLogDb, fetchPollLogDailyDb } from '@/lib/home-charger/poll-log';
import { getTtlInfo, getLastQuotaHitAt, getWarmDiag } from '@/lib/home-charger-cache';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const view = searchParams.get('view') || 'hourly';
  const diag = getWarmDiag();
  if (view === 'daily') {
    const days = Number(searchParams.get('days')) || 14;
    const data = await fetchPollLogDailyDb(days);
    return Response.json({ ...data, lastQuotaHitAt: getLastQuotaHitAt(), warmDiag: diag });
  }
  const date = searchParams.get('date') || null;
  const data = await fetchPollLogDb(date);
  return Response.json({ ...data, ttlInfo: getTtlInfo(), lastQuotaHitAt: getLastQuotaHitAt(), warmDiag: diag });
}
