import pool from '@/lib/db';
import { KWH_PER_KM } from '@/lib/constants';
import { batchReverseGeocode } from '@/lib/kakao-geo';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from'); // 선택: YYYY-MM-DD 형식 시작일
    const to   = searchParams.get('to');   // 선택: YYYY-MM-DD 형식 종료일 (exclusive)

    const carResult = await pool.query(`SELECT id FROM cars LIMIT 1`);
    if (carResult.rows.length === 0) {
      return Response.json({ error: 'No car found' }, { status: 404 });
    }
    const carId = carResult.rows[0].id;

    const now = new Date();
    // KST(UTC+9) 기준 자정 계산
    const KST = 9 * 60 * 60 * 1000;
    const nowKST = new Date(now.getTime() + KST);
    const ky = nowKST.getUTCFullYear(), km = nowKST.getUTCMonth(), kd = nowKST.getUTCDate();
    const todayStart    = new Date(Date.UTC(ky, km, kd) - KST);
    const weekStart     = new Date(todayStart.getTime() - 7  * 86400000);
    const prevWeekEnd   = new Date(weekStart);
    const prevWeekStart = new Date(todayStart.getTime() - 14 * 86400000);
    const monthStart    = new Date(Date.UTC(ky, km, 1) - KST);

    // 날짜 범위 WHERE 절 동적 구성 (recent_drives 용)
    let rangeClause = '';
    const rangeParams = [carId];
    if (from) { rangeClause += ` AND d.start_date >= $${rangeParams.push(from)}`; }
    if (to)   { rangeClause += ` AND d.start_date < $${rangeParams.push(to)}`; }

    const aggQuery = (start, end) => {
      const params = end
        ? [carId, start.toISOString(), end.toISOString()]
        : [carId, start.toISOString()];
      const whereEnd = end ? ` AND start_date < $3` : '';
      return pool.query(
        `SELECT COALESCE(SUM(distance), 0)::float AS distance,
                COALESCE(SUM(CASE WHEN start_rated_range_km IS NOT NULL AND end_rated_range_km IS NOT NULL
                                  THEN (start_rated_range_km - end_rated_range_km) ELSE 0 END), 0)::float AS range_used
         FROM drives WHERE car_id = $1 AND start_date >= $2${whereEnd}`,
        params
      );
    };

    // DB 레벨 SUM으로 각 기간 집계 (LIMIT 없이 정확한 값 보장)
    const [todayResult, weekResult, prevWeekResult, monthResult, drivesResult] = await Promise.all([
      aggQuery(todayStart),
      aggQuery(weekStart),
      aggQuery(prevWeekStart, prevWeekEnd),
      aggQuery(monthStart),
      pool.query(
        `SELECT d.id, d.start_date, d.end_date, d.distance, d.duration_min,
                d.start_rated_range_km, d.end_rated_range_km,
                sp.battery_level AS start_battery_level,
                ep.battery_level AS end_battery_level,
                sp.latitude AS start_lat, sp.longitude AS start_lng,
                ep.latitude AS end_lat, ep.longitude AS end_lng,
                sg.name AS start_geofence_name,
                eg.name AS end_geofence_name,
                NULLIF(TRIM(CONCAT_WS(' ', sa.road, sa.house_number)), '') AS start_osm,
                NULLIF(TRIM(CONCAT_WS(' ', ea.road, ea.house_number)), '') AS end_osm
         FROM drives d
         LEFT JOIN addresses sa ON sa.id = d.start_address_id
         LEFT JOIN addresses ea ON ea.id = d.end_address_id
         LEFT JOIN geofences sg ON sg.id = d.start_geofence_id
         LEFT JOIN geofences eg ON eg.id = d.end_geofence_id
         LEFT JOIN positions sp ON sp.id = d.start_position_id
         LEFT JOIN positions ep ON ep.id = d.end_position_id
         WHERE d.car_id = $1${rangeClause}
         ORDER BY d.start_date DESC
         LIMIT 200`,
        rangeParams
      ),
    ]);

    const toKwh = (range_used) => parseFloat((range_used * KWH_PER_KM).toFixed(1));

    // Kakao 역지오코딩 — 지오펜스 이름이 없는 주소에만 적용
    const drives = drivesResult.rows;
    const startCoords = drives.map(d => ({ lat: d.start_lat ? parseFloat(d.start_lat) : null, lng: d.start_lng ? parseFloat(d.start_lng) : null }));
    const endCoords   = drives.map(d => ({ lat: d.end_lat   ? parseFloat(d.end_lat)   : null, lng: d.end_lng   ? parseFloat(d.end_lng)   : null }));
    const [kakaoStarts, kakaoEnds] = await Promise.all([
      batchReverseGeocode(startCoords),
      batchReverseGeocode(endCoords),
    ]);

    return Response.json({
      today_distance:       parseFloat(todayResult.rows[0].distance.toFixed(1)),
      today_energy_kwh:     toKwh(todayResult.rows[0].range_used),
      week_distance:        parseFloat(weekResult.rows[0].distance.toFixed(1)),
      week_energy_kwh:      toKwh(weekResult.rows[0].range_used),
      prev_week_distance:   parseFloat(prevWeekResult.rows[0].distance.toFixed(1)),
      prev_week_energy_kwh: toKwh(prevWeekResult.rows[0].range_used),
      month_distance:       parseFloat(monthResult.rows[0].distance.toFixed(1)),
      month_energy_kwh:     toKwh(monthResult.rows[0].range_used),
      recent_drives: drives.map((d, i) => ({
        id: d.id,
        start_date: d.start_date,
        end_date:   d.end_date,
        distance:   d.distance ? parseFloat(parseFloat(d.distance).toFixed(1)) : 0,
        duration_min: d.duration_min ? Math.round(parseFloat(d.duration_min)) : null,
        start_address: d.start_geofence_name || kakaoStarts[i] || d.start_osm || null,
        end_address:   d.end_geofence_name   || kakaoEnds[i]   || d.end_osm   || null,
        start_rated_range_km: d.start_rated_range_km ? parseFloat(parseFloat(d.start_rated_range_km).toFixed(1)) : null,
        end_rated_range_km:   d.end_rated_range_km   ? parseFloat(parseFloat(d.end_rated_range_km).toFixed(1))   : null,
        start_battery_level: d.start_battery_level ?? null,
        end_battery_level:   d.end_battery_level   ?? null,
      })),
    });
  } catch (err) {
    console.error('/api/drives error:', err);
    return Response.json({ error: 'DB error' }, { status: 500 });
  }
}
