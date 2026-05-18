import { requireAuth, assertSameOrigin } from '@/lib/auth-helper';
import { executeAction } from '@/lib/schedule-runner';

export const dynamic = 'force-dynamic';

// POST /api/now-command — 즉시 실행 (UI/봇 버튼)
// body: { action: 'sentry_on' | 'sentry_off' | 'climate_on' | 'climate_off' | 'lock' | 'unlock' | 'set_charge_limit', params?: {} }
export async function POST(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  if (assertSameOrigin) assertSameOrigin(req);
  try {
    const body = await req.json();
    if (!body?.action) return Response.json({ error: 'action required' }, { status: 400 });
    const result = await executeAction({
      schedule_id: null,
      action: body.action,
      action_params: body.params || {},
      trigger_source: 'manual',
    });
    return Response.json({ ok: true, result });
  } catch (e) {
    return Response.json({ error: e?.message || 'unknown' }, { status: 500 });
  }
}
