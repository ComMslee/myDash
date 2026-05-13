import { requireAuth } from '@/lib/auth-helper';
import { listExecutions } from '@/lib/queries/schedules';

export const dynamic = 'force-dynamic';

// GET /api/schedules/executions?limit=100 — 전체 통합 이력
export async function GET(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 500);
  const rows = await listExecutions({ limit });
  return Response.json({ executions: rows });
}
