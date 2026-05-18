import { requireAuth } from '@/lib/auth-helper';
import { getAutomationEnabled, setAutomationEnabled } from '@/lib/queries/schedules';

export const dynamic = 'force-dynamic';

export async function GET() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const enabled = await getAutomationEnabled();
  return Response.json({ enabled });
}

export async function PUT(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  try {
    const body = await req.json();
    if (typeof body?.enabled !== 'boolean') {
      return Response.json({ error: 'enabled(boolean) required' }, { status: 400 });
    }
    await setAutomationEnabled(body.enabled);
    return Response.json({ enabled: body.enabled });
  } catch (e) {
    return Response.json({ error: e?.message || 'unknown' }, { status: 500 });
  }
}
