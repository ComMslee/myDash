import { fetchFleetStatsDb, getStatIds } from '@/lib/home-charger-cache';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const months = Number(searchParams.get('months')) || 3;
  const statIds = getStatIds();
  const stats = await fetchFleetStatsDb(statIds, months);
  return Response.json(stats);
}
