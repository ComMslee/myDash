import { fetchPollLogDb } from '@/lib/home-charger-cache';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') || null;
  const data = await fetchPollLogDb(date);
  return Response.json(data);
}
