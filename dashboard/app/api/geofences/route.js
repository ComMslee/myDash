import { requireAuth } from '@/lib/auth-helper';
import { listGeofences, upsertGeofence } from '@/lib/queries/schedules';

export const dynamic = 'force-dynamic';

export async function GET() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const rows = await listGeofences();
  return Response.json({ geofences: rows });
}

export async function POST(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  try {
    const body = await req.json();
    if (!body?.name || body?.lat == null || body?.lng == null) {
      return Response.json({ error: 'name/lat/lng required' }, { status: 400 });
    }
    const row = await upsertGeofence(body);
    return Response.json({ geofence: row });
  } catch (e) {
    return Response.json({ error: e?.message || 'unknown' }, { status: 500 });
  }
}
