import { requireAuth } from '@/lib/auth-helper';
import { getRecentlyPlayed } from '@/lib/spotify/client';

export const dynamic = 'force-dynamic';

// L3 운전 매시업 — 운전 시간 [start, end] 와 Spotify 최근 재생 50곡의 played_at 교집합.
//
// ⚠️  Spotify recently-played 는 최근 50곡 캡 — 음악 안 듣고 N일 지난 운전은
//     매칭 못함. 응답의 cappedAt50 / oldestAvailable 로 UI 가 안내.
//
// 디바이스 정보는 recently-played 에 없어서 디바이스 필터링 불가 (폰/스피커 섞일 수 있음).

export async function GET(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;

  try {
    const url = new URL(req.url);
    const startStr = url.searchParams.get('start');
    const endStr = url.searchParams.get('end');
    if (!startStr || !endStr) {
      return Response.json({ error: 'start_end_required' }, { status: 400 });
    }
    const startMs = Date.parse(startStr);
    const endMs = Date.parse(endStr);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return Response.json({ error: 'invalid_time_range' }, { status: 400 });
    }

    const { items } = await getRecentlyPlayed(50);
    if (!items.length) {
      return Response.json({ items: [], cappedAt50: false, oldestAvailable: null });
    }

    // played_at 은 곡 종료 시점 (Spotify 명세). 시작 시점 ≈ played_at - duration.
    // 운전 [start, end] 와 곡 [trackStart, played_at] 가 겹치면 매칭.
    const matched = items.filter(t => {
      const playedAtMs = Date.parse(t.playedAt);
      const trackStartMs = playedAtMs - (t.durationMs || 0);
      return playedAtMs >= startMs && trackStartMs <= endMs;
    }).sort((a, b) => Date.parse(a.playedAt) - Date.parse(b.playedAt));

    // 가장 오래된 recently-played 가 운전 start 보다 이후면 → 50곡 캡으로 누락 가능
    const oldestPlayedAt = items[items.length - 1]?.playedAt;
    const oldestMs = oldestPlayedAt ? Date.parse(oldestPlayedAt) : null;
    const cappedAt50 = oldestMs !== null && oldestMs > startMs && items.length >= 50;

    return Response.json({
      items: matched,
      cappedAt50,
      oldestAvailable: oldestPlayedAt,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
