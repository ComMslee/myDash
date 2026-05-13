import { requireAuth } from '@/lib/auth-helper';
import { getSchedule } from '@/lib/queries/schedules';
import { executeAction } from '@/lib/schedule-runner';

export const dynamic = 'force-dynamic';

// POST /api/schedules/:id/run-now — 사용자가 즉시 1회 실행 (dry-run/실행)
export async function POST(req, { params }) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return Response.json({ error: 'bad id' }, { status: 400 });
  const row = await getSchedule(id);
  if (!row) return Response.json({ error: 'not found' }, { status: 404 });
  const result = await executeAction({
    schedule_id: row.id,
    action: row.action,
    action_params: row.action_params,
    trigger_source: 'manual',
  });
  return Response.json({ ok: true, result });
}
