import { requireAuth } from '@/lib/auth-helper';
import { getRecentlyPlayed, checkIsFavoriteBatch } from '@/lib/spotify/client';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;

  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get('limit')) || 5;

    const { items } = await getRecentlyPlayed(limit);
    if (!items.length) return Response.json({ items: [] });

    // 즐겨찾기 일괄 확인 — 1 API 콜로 N개 트랙 처리
    const trackIds = items.map(t => t.trackId);
    const favMap = await checkIsFavoriteBatch(trackIds);

    return Response.json({
      items: items.map(t => ({ ...t, isFavorite: favMap[t.trackId] || false })),
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
