import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';
import { withCache } from '@/lib/server-cache';

export const dynamic = 'force-dynamic';

// 직선/도로 거리 보정 계수 — 도시 평균 (직선 N km ≈ 도로 N/계수 km 운행 가능)
const ROAD_FACTOR = 0.65;

// 현 위치 + SOC + rated km → 잔여 주행 가능 반경 (편도/왕복).
// 지도 오버레이용 — /v2/battery 최상단 카드에서 호출.
export async function GET() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  try {
    const car = await getDefaultCar();
    if (!car) return Response.json({ error: 'No car found' }, { status: 404 });

    return Response.json(await withCache(`range-radius:${car.id}`, 60_000, async () => {
      const carId = car.id;
      const { rows } = await pool.query(
        `SELECT
           (SELECT latitude::float FROM positions
              WHERE car_id=$1 AND latitude IS NOT NULL
              ORDER BY date DESC LIMIT 1) AS lat,
           (SELECT longitude::float FROM positions
              WHERE car_id=$1 AND longitude IS NOT NULL
              ORDER BY date DESC LIMIT 1) AS lng,
           (SELECT battery_level FROM positions
              WHERE car_id=$1 ORDER BY date DESC LIMIT 1) AS soc,
           (SELECT rated_battery_range_km::float FROM positions
              WHERE car_id=$1 AND rated_battery_range_km IS NOT NULL
              ORDER BY date DESC LIMIT 1) AS rated_km,
           (SELECT est_battery_range_km::float FROM positions
              WHERE car_id=$1 AND est_battery_range_km IS NOT NULL
              ORDER BY date DESC LIMIT 1) AS est_km,
           (SELECT date FROM positions WHERE car_id=$1 ORDER BY date DESC LIMIT 1) AS pos_ts,
           (SELECT state FROM states WHERE car_id=$1 ORDER BY start_date DESC LIMIT 1) AS state`,
        [carId]
      );
      const r = rows[0] || {};
      if (r.lat == null || r.lng == null || r.rated_km == null) {
        return { available: false };
      }

      const ratedKm = Number(r.rated_km);
      const oneWayKm = ratedKm * ROAD_FACTOR;
      const roundTripKm = oneWayKm / 2;

      return {
        available: true,
        position: { lat: r.lat, lng: r.lng, ts: r.pos_ts },
        soc: r.soc,
        rated_km: Math.round(ratedKm),
        est_km: r.est_km != null ? Math.round(Number(r.est_km)) : null,
        road_factor: ROAD_FACTOR,
        one_way_km: Math.round(oneWayKm),
        round_trip_km: Math.round(roundTripKm),
        state: r.state || 'unknown',
        is_charging: r.state === 'charging',
      };
    }));
  } catch (e) {
    console.error('/api/range-radius error:', e);
    return Response.json({ error: 'DB error', detail: e.message }, { status: 500 });
  }
}
