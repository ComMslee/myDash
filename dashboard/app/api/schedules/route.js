import { requireAuth } from '@/lib/auth-helper';
import { listSchedules, createSchedule } from '@/lib/queries/schedules';

export const dynamic = 'force-dynamic';

// GET /api/schedules — 전체 목록
// POST /api/schedules — 생성 { name, action, action_params, trigger_config, ... }
export async function GET() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  try {
    const rows = await listSchedules();
    return Response.json({ schedules: rows });
  } catch (e) {
    return Response.json({ error: e?.message || 'unknown' }, { status: 500 });
  }
}

export async function POST(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  try {
    const body = await req.json();
    if (!body?.name || !body?.action) {
      return Response.json({ error: 'name/action required' }, { status: 400 });
    }
    const row = await createSchedule(body);
    return Response.json({ schedule: row });
  } catch (e) {
    return Response.json({ error: e?.message || 'unknown' }, { status: 500 });
  }
}
