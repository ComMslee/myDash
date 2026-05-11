import { requireAuth } from '@/lib/auth-helper';
import { getCurrentPlayback, isVehicleDevice } from '@/lib/spotify/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;

  try {
    const data = await getCurrentPlayback();
    if (!data || !data.item) {
      return Response.json({ playing: false });
    }

    const item = data.item;
    const device = data.device || null;

    return Response.json({
      playing: true,
      trackId: item.id,
      uri: item.uri,
      name: item.name,
      artist: (item.artists || []).map(a => a.name).join(', '),
      albumArt: item.album?.images?.[0]?.url || '',
      albumArtSmall: item.album?.images?.at(-1)?.url || '',
      durationMs: item.duration_ms,
      progressMs: data.progress_ms || 0,
      isPlaying: !!data.is_playing,
      device: device ? {
        id: device.id,
        name: device.name,
        type: device.type,
        isVehicle: isVehicleDevice(device),
        volumePercent: device.volume_percent,
      } : null,
      timestamp: Date.now(),
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
