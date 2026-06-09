import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';
import { withCache } from '@/lib/server-cache';

export const dynamic = 'force-dynamic';

// 현 위치 + 예상 주행거리(est_battery_range_km) → 잔여 주행 가능 반경 (편도/왕복).
// est 결측 시 rated 폴백. 지도 오버레이용 — /v2/battery 최상단 카드에서 호출.
const ROAD_FACTOR = 0.85;
export async function GET() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  try {
    const car = await getDefaultCar();
    if (!car) return Response.json({ error: 'No car found' }, { status: 404 });

    return Response.json(await withCache(`range-radius:${car.id}`, 60_000, async () => {
      const carId = car.id;
      // soc·est_km·rated_km 은 반드시 같은 positions 행에서 — 별도 서브쿼리면
      // 충전 완료 후 슬립 중 range 컬럼 NULL 행이 쌓여 SOC 100% + 옛 270km 불일치 발생
      const { rows } = await pool.query(
        `SELECT
           p.latitude::float                 AS lat,
           p.longitude::float                AS lng,
           p.battery_level                   AS soc,
           p.rated_battery_range_km::float   AS rated_km,
           p.est_battery_range_km::float     AS est_km,
           p.date                            AS pos_ts,
           (SELECT state FROM states WHERE car_id=$1 ORDER BY start_date DESC LIMIT 1) AS state
         FROM positions p
         WHERE p.car_id=$1
           AND (p.est_battery_range_km IS NOT NULL OR p.rated_battery_range_km IS NOT NULL)
           AND p.latitude IS NOT NULL
         ORDER BY p.date DESC LIMIT 1`,
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
        basis,
        base_km: Math.round(baseKm),
        est_km: r.est_km != null ? Math.round(Number(r.est_km)) : null,
        rated_km: r.rated_km != null ? Math.round(Number(r.rated_km)) : null,
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
