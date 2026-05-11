import { requireAuth } from '@/lib/auth-helper';
import { fetchFleetStatsDb } from '@/lib/home-charger/fleet-stats';
import { getStatIds } from '@/lib/home-charger-cache';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const { searchParams } = new URL(req.url);
  const months = Number(searchParams.get('months')) || 3;
  const statIds = getStatIds();
  const stats = await fetchFleetStatsDb(statIds, months);
  return Response.json(stats);
}
