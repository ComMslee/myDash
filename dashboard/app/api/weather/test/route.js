import { requireAuth } from '@/lib/auth-helper';
import { getWeatherAt } from '@/lib/weather';

export const dynamic = 'force-dynamic';

// GET /api/weather/test?lat=&lng= — 기상청 단기예보 connectivity 테스트.
// 키 미설정 → 명확한 에러. 좌표 미지정 → 서울 시청 좌표로 호출.
// 캐시 1시간 — 같은 좌표 반복 호출은 cached=true 표시.
export async function GET(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') || '37.5665');
  const lng = parseFloat(searchParams.get('lng') || '126.9780');
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: 'bad lat/lng' }, { status: 400 });
  }
  const apiKeyMissing = !process.env.KMA_API_KEY;
  const r = await getWeatherAt(lat, lng);
  return Response.json({
    apiKeyMissing,
    lat, lng,
    ...r,
  });
}
