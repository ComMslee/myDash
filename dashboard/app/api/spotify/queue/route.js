import { requireAuth } from '@/lib/auth-helper';
import { getQueue } from '@/lib/spotify/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;

  try {
    const data = await getQueue();
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
