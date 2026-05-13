import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';
import { withCache } from '@/lib/server-cache';

export const dynamic = 'force-dynamic';

// 직선/도로 거리 보정 계수 — est 기반(이미 현실치) + 도로 우회 보정 0.75
const ROAD_FACTOR = 0.75;

// 현 위치 + 예상 주행거리(est_battery_range_km) → 잔여 주행 가능 반경 (편도/왕복).
// est 결측 시 rated 폴백. 지도 오버레이용 — /v2/battery 최상단 카드에서 호출.
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
      // est 우선, est 결측 시 rated 폴백 — 둘 다 없으면 표시 불가
      const baseKm = r.est_km != null ? Number(r.est_km)
                   : r.rated_km != null ? Number(r.rated_km)
                   : null;
      if (r.lat == null || r.lng == null || baseKm == null) {
        return { available: false };
      }

      const basis = r.est_km != null ? 'est' : 'rated';
      const oneWayKm = baseKm * ROAD_FACTOR;
      const roundTripKm = oneWayKm / 2;

      return {
        available: true,
        position: { lat: r.lat, lng: r.lng, ts: r.pos_ts },
        soc: r.soc,
        basis,                                  // 'est' | 'rated'
        base_km: Math.round(baseKm),            // 계산 기준 km
        est_km: r.est_km != null ? Math.round(Number(r.est_km)) : null,
        rated_km: r.rated_km != null ? Math.round(Number(r.rated_km)) : null,
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
