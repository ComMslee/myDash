import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';
import { withCache } from '@/lib/server-cache';
import { TTL_300S } from '@/lib/cache-ttls';

export const dynamic = 'force-dynamic';

// 충전 위치 클러스터링 — addresses/geofences 좌표를 ~110m 격자(0.001°)로 bin → 빈도/총 kWh/급속·완속 카운트 집계.
// /v2/battery 의 ChargingLocationsCard 에 사용. 단순 마커 클러스터링용이므로 reverse geocoding 없이 DB 라벨만 반환.
export async function GET(request) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const force = new URL(request.url).searchParams.get('refresh') === '1';
  try {
    const car = await getDefaultCar();
    if (!car) return Response.json({ locations: [] });
    const carId = car.id;

    return Response.json(await withCache(`charging-locations:${carId}`, TTL_300S, async () => {
      const result = await pool.query(
        `WITH cp_loc AS (
           SELECT
             cp.id,
             cp.end_date,
             cp.charge_energy_added,
             COALESCE(g.latitude,  a.latitude)  AS lat,
             COALESCE(g.longitude, a.longitude) AS lng,
             COALESCE(g.name, a.name, a.road, a.display_name, '알 수 없음') AS label,
             EXISTS (
               SELECT 1 FROM charges c
               WHERE c.charging_process_id = cp.id
                 AND c.fast_charger_present = true
             ) AS is_fast
           FROM charging_processes cp
           LEFT JOIN addresses a ON a.id = cp.address_id
           LEFT JOIN geofences g ON g.id = cp.geofence_id
           WHERE cp.car_id = $1
             AND COALESCE(g.latitude, a.latitude) IS NOT NULL
             AND cp.charge_energy_added IS NOT NULL
         ),
         binned AS (
           SELECT
             ROUND(lat::numeric, 3)::float8 AS bin_lat,
             ROUND(lng::numeric, 3)::float8 AS bin_lng,
             AVG(lat)::float8 AS center_lat,
             AVG(lng)::float8 AS center_lng,
             COUNT(*)::int AS cnt,
             SUM(charge_energy_added)::float8 AS total_kwh,
             SUM(CASE WHEN is_fast THEN 1 ELSE 0 END)::int AS fast_count,
             SUM(CASE WHEN is_fast THEN 0 ELSE 1 END)::int AS slow_count,
             MAX(end_date) AS last_date,
             (ARRAY_AGG(label ORDER BY end_date DESC NULLS LAST))[1] AS label
           FROM cp_loc
           GROUP BY 1, 2
         )
         SELECT * FROM binned
         ORDER BY cnt DESC, total_kwh DESC
         LIMIT 200`,
        [carId]
      );

      return {
        locations: result.rows.map(r => ({
          lat: parseFloat(r.center_lat),
          lng: parseFloat(r.center_lng),
          label: r.label || '알 수 없음',
          count: r.cnt,
          total_kwh: r.total_kwh ? Math.round(parseFloat(r.total_kwh) * 10) / 10 : 0,
          fast_count: r.fast_count,
          slow_count: r.slow_count,
          last_date: r.last_date,
        })),
      };
    }, { force }));
  } catch (err) {
    console.error('/api/charging-locations error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
