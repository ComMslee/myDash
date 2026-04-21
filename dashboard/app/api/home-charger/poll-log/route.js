import { fetchPollLogDb, fetchPollLogDailyDb, getTtlInfo } from '@/lib/home-charger-cache';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const view = searchParams.get('view') || 'hourly';
  if (view === 'daily') {
    const days = Number(searchParams.get('days')) || 14;
    const data = await fetchPollLogDailyDb(days);
    return Response.json(data);
  }
  const date = searchParams.get('date') || null;
  const data = await fetchPollLogDb(date);
  return Response.json({ ...data, ttlInfo: getTtlInfo() });
}
