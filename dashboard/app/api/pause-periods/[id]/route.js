import { requireAuth, assertSameOrigin } from '@/lib/auth-helper';
import { deletePausePeriod } from '@/lib/queries/schedules';

export const dynamic = 'force-dynamic';

export async function DELETE(req, { params }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) return Response.json({ error: 'bad id' }, { status: 400 });
  await deletePausePeriod(id);
  return Response.json({ ok: true });
}
