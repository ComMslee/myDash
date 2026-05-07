import { requireAuth } from '@/lib/auth-helper';
import { reverseGeocode } from '@/lib/kakao-geo';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat'));
    const lng = parseFloat(searchParams.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return Response.json({ error: 'lat/lng required' }, { status: 400 });
    }
    const label = await reverseGeocode(lat, lng);
    return Response.json({ label: label || null });
  } catch (err) {
    console.error('/api/resolve-address error:', err);
    return Response.json({ error: 'resolve failed' }, { status: 500 });
  }
}
