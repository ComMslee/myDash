import { requireAuth } from '@/lib/auth-helper';
import { listExecutions } from '@/lib/queries/schedules';

export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return Response.json({ error: 'bad id' }, { status: 400 });
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 500);
  const rows = await listExecutions({ schedule_id: id, limit });
  return Response.json({ executions: rows });
}
