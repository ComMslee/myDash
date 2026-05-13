import { requireAuth } from '@/lib/auth-helper';
import { upsertGeofence, deleteGeofence } from '@/lib/queries/schedules';

export const dynamic = 'force-dynamic';

export async function PUT(req, { params }) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return Response.json({ error: 'bad id' }, { status: 400 });
  try {
    const body = await req.json();
    const row = await upsertGeofence({ ...body, id });
    return Response.json({ geofence: row });
  } catch (e) {
    return Response.json({ error: e?.message || 'unknown' }, { status: 500 });
  }
}

export async function DELETE(_req, { params }) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return Response.json({ error: 'bad id' }, { status: 400 });
  await deleteGeofence(id);
  return Response.json({ ok: true });
}
