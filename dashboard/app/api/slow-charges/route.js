import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';
import { withCache } from '@/lib/server-cache';
import { TTL_180S } from '@/lib/cache-ttls';

export const dynamic = 'force-dynamic';

const RECORDS_PER_PAGE = 20;

function mapRecord(r) {
  return {
    id: r.id,
    start_date: r.start_date,
    end_date: r.end_date,
    energy_kwh: r.charge_energy_added ? parseFloat(parseFloat(r.charge_energy_added).toFixed(1)) : 0,
    duration_min: r.duration_min ? Math.round(parseFloat(r.duration_min)) : null,
    soc_start: r.start_battery_level ?? null,
    soc_end: r.end_battery_level ?? null,
    location: r.location || '알 수 없음',
    min_power: r.min_power ? parseFloat(r.min_power.toFixed(1)) : null,
    max_power: r.max_power ? parseFloat(r.max_power.toFixed(1)) : null,
    avg_power: r.avg_power ? parseFloat(r.avg_power.toFixed(1)) : null,
  };
}

export async function GET(request) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const sp = new URL(request.url).searchParams;
  const force = sp.get('refresh') === '1';
  const isMore = sp.has('offset');
  const offset = Math.max(0, parseInt(sp.get('offset') || '0', 10));

  try {
    const car = await getDefaultCar();
    if (!car) return Response.json({ months: [], records: [], has_more: false });
    const carId = car.id;

    // "더 보기" 요청 — 추가 records만 반환
    if (isMore) {
      return Response.json(await withCache(`slow-charges:${carId}:${offset}`, TTL_180S, async () => {
        const result = await pool.query(
          `SELECT cp.id, cp.start_date, cp.end_date, cp.charge_energy_added, cp.duration_min,
                  cp.start_battery_level, cp.end_battery_level,
                  COALESCE(g.name, a.name, a.road, a.display_name) AS location,
                  sub.min_power, sub.max_power, sub.avg_power
           FROM charging_processes cp
           LEFT JOIN addresses a ON a.id = cp.address_id
           LEFT JOIN geofences g ON g.id = cp.geofence_id
           JOIN (
             SELECT c.charging_process_id,
               MIN(c.charger_power) FILTER (WHERE c.charger_power > 0)::float AS min_power,
               MAX(c.charger_power)::float AS max_power,
               AVG(c.charger_power) FILTER (WHERE c.charger_power > 0)::float AS avg_power
             FROM charges c WHERE COALESCE(c.fast_charger_present, false) = false GROUP BY c.charging_process_id
           ) sub ON sub.charging_process_id = cp.id
           WHERE cp.car_id = $1
           ORDER BY cp.start_date DESC
           LIMIT $2 OFFSET $3`,
          [carId, RECORDS_PER_PAGE + 1, offset]
        );
        const rows = result.rows;
        return { records: rows.slice(0, RECORDS_PER_PAGE).map(mapRecord), has_more: rows.length > RECORDS_PER_PAGE };
      }, { force }));
    }

    // 초기 로드 — 월별 집계 + 최근 records
    return Response.json(await withCache(`slow-charges-init:${carId}`, TTL_180S, async () => {
      const [monthRes, recordRes] = await Promise.all([
        pool.query(
          `SELECT
             TO_CHAR(cp.start_date AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS month,
             COUNT(*)::int AS count,
             COALESCE(SUM(cp.charge_energy_added), 0)::float AS total_kwh,
             AVG(sub.avg_power)::float AS avg_kw
           FROM charging_processes cp
           JOIN (
             SELECT c.charging_process_id,
               AVG(c.charger_power) FILTER (WHERE c.charger_power > 0)::float AS avg_power
             FROM charges c WHERE COALESCE(c.fast_charger_present, false) = false GROUP BY c.charging_process_id
           ) sub ON sub.charging_process_id = cp.id
           WHERE cp.car_id = $1
           GROUP BY month ORDER BY month DESC`,
          [carId]
        ),
        pool.query(
          `SELECT cp.id, cp.start_date, cp.end_date, cp.charge_energy_added, cp.duration_min,
                  cp.start_battery_level, cp.end_battery_level,
                  COALESCE(g.name, a.name, a.road, a.display_name) AS location,
                  sub.min_power, sub.max_power, sub.avg_power
           FROM charging_processes cp
           LEFT JOIN addresses a ON a.id = cp.address_id
           LEFT JOIN geofences g ON g.id = cp.geofence_id
           JOIN (
             SELECT c.charging_process_id,
               MIN(c.charger_power) FILTER (WHERE c.charger_power > 0)::float AS min_power,
               MAX(c.charger_power)::float AS max_power,
               AVG(c.charger_power) FILTER (WHERE c.charger_power > 0)::float AS avg_power
             FROM charges c WHERE COALESCE(c.fast_charger_present, false) = false GROUP BY c.charging_process_id
           ) sub ON sub.charging_process_id = cp.id
           WHERE cp.car_id = $1
           ORDER BY cp.start_date DESC
           LIMIT $2`,
          [carId, RECORDS_PER_PAGE + 1]
        ),
      ]);

      const rows = recordRes.rows;
      return {
        months: monthRes.rows.map(r => ({
          month: r.month,
          count: r.count,
          total_kwh: parseFloat(parseFloat(r.total_kwh).toFixed(1)),
          avg_kw: r.avg_kw ? parseFloat(parseFloat(r.avg_kw).toFixed(1)) : null,
        })),
        records: rows.slice(0, RECORDS_PER_PAGE).map(mapRecord),
        has_more: rows.length > RECORDS_PER_PAGE,
      };
    }, { force }));
  } catch (err) {
    console.error('/api/slow-charges error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
