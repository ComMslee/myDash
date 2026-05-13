import pool from '@/lib/db';
import { listGeofences, recordLocationEvent } from '@/lib/queries/schedules';

// 지오펜스 진입·이탈 감지 — TeslaMate positions 최신 좌표를 매분 폴링 후
// 이전 상태(in/out)와 비교하여 변화 시 dash_location_events INSERT.
// 워커가 매분 1회 호출.

let lastInside = null; // Map<geofence_id, lastInside:boolean>

function distMeters(a, b) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export async function detectAndRecord() {
  const r = await pool.query(
    `SELECT latitude AS lat, longitude AS lng FROM positions ORDER BY date DESC LIMIT 1`,
  ).catch(() => ({ rows: [] }));
  const pos = r.rows[0];
  if (!pos || pos.lat == null || pos.lng == null) return { events: 0 };

  const geofences = await listGeofences();
  if (lastInside == null) lastInside = new Map();

  let events = 0;
  for (const g of geofences) {
    const d = distMeters({ lat: g.lat, lng: g.lng }, { lat: pos.lat, lng: pos.lng });
    const inside = d <= (g.radius_m || 100);
    const prev = lastInside.get(g.id);
    if (prev === undefined) {
      lastInside.set(g.id, inside);
      continue;
    }
    if (prev !== inside) {
      const event_type = inside ? 'enter' : 'exit';
      await recordLocationEvent({
        geofence_id: g.id,
        event_type,
        lat: pos.lat,
        lng: pos.lng,
      });
      lastInside.set(g.id, inside);
      events++;
    }
  }
  return { events };
}
