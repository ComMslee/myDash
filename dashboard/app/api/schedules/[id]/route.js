import { requireAuth } from '@/lib/auth-helper';
import { getSchedule, updateSchedule, deleteSchedule } from '@/lib/queries/schedules';

export const dynamic = 'force-dynamic';

export async function GET(_req, { params }) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return Response.json({ error: 'bad id' }, { status: 400 });
  const row = await getSchedule(id);
  if (!row) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json({ schedule: row });
}

export async function PUT(req, { params }) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return Response.json({ error: 'bad id' }, { status: 400 });
  try {
    const patch = await req.json();
    const row = await updateSchedule(id, patch);
    if (!row) return Response.json({ error: 'not found' }, { status: 404 });
    return Response.json({ schedule: row });
  } catch (e) {
    return Response.json({ error: e?.message || 'unknown' }, { status: 500 });
  }
}

export async function DELETE(_req, { params }) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return Response.json({ error: 'bad id' }, { status: 400 });
  await deleteSchedule(id);
  return Response.json({ ok: true });
}
