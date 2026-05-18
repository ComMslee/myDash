import { requireAuth } from '@/lib/auth-helper';
import { listPausePeriods, createPausePeriod } from '@/lib/queries/schedules';

export const dynamic = 'force-dynamic';

export async function GET() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const rows = await listPausePeriods();
  return Response.json({ pause_periods: rows });
}

export async function POST(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  try {
    const body = await req.json();
    if (!body?.from_date || !body?.until_date) {
      return Response.json({ error: 'from_date/until_date required' }, { status: 400 });
    }
    const row = await createPausePeriod(body);
    return Response.json({ pause_period: row });
  } catch (e) {
    return Response.json({ error: e?.message || 'unknown' }, { status: 500 });
  }
}
