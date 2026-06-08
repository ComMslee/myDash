import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';
import { withCache } from '@/lib/server-cache';
import { TTL_180S } from '@/lib/cache-ttls';

export const dynamic = 'force-dynamic';

function mapRecord(r) {
  return {
    id: r.id,
    start_date: r.start_date,
    end_date: r.end_date,
    energy_kwh: r.charge_energy_added ? parseFloat(parseFloat(r.charge_energy_added).toFixed(1)) : 0,
    duration_min: r.duration_min ? Math.round(parseFloat(r.duration_min)) : null,
    location: r.location || '알 수 없음',
    min_power: r.min_power ? parseFloat(r.min_power.toFixed(1)) : null,
    max_power: r.max_power ? parseFloat(r.max_power.toFixed(1)) : null,
    avg_power: r.avg_power ? parseFloat(r.avg_power.toFixed(1)) : null,
    charger_brand: r.charger_brand || null,
    charger_type: r.charger_type || null,
  };
}

export async function GET(request) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const sp = new URL(request.url).searchParams;
  const force = sp.get('refresh') === '1';

  try {
    const car = await getDefaultCar();
    if (!car) return Response.json({ months: [], records: [], has_more: false });
    const carId = car.id;

    return Response.json(await withCache(`fast-charges-init:${carId}`, TTL_180S, async () => {
      const [monthRes, recordRes] = await Promise.all([
        pool.query(
          `SELECT
             TO_CHAR(cp.start_date AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS month,
             COUNT(*)::int AS count,
             COALESCE(SUM(cp.charge_energy_added), 0)::float AS total_kwh,
             MAX(sub.max_power)::float AS peak_kw
           FROM charging_processes cp
           JOIN (
             SELECT charging_process_id, MAX(charger_power)::float AS max_power
             FROM charges WHERE fast_charger_present = true GROUP BY charging_process_id
           ) sub ON sub.charging_process_id = cp.id
           WHERE cp.car_id = $1
           GROUP BY month ORDER BY month DESC`,
          [carId]
        ),
        pool.query(
          `SELECT cp.id, cp.start_date, cp.end_date, cp.charge_energy_added, cp.duration_min,
                  COALESCE(a.name, a.road, a.display_name) AS location,
                  sub.min_power, sub.max_power, sub.avg_power, sub.charger_brand, sub.charger_type
           FROM charging_processes cp
           LEFT JOIN addresses a ON a.id = cp.address_id
           JOIN (
             SELECT c.charging_process_id,
               MIN(c.charger_power) FILTER (WHERE c.charger_power > 0)::float AS min_power,
               MAX(c.charger_power)::float AS max_power,
               AVG(c.charger_power) FILTER (WHERE c.charger_power > 0)::float AS avg_power,
               MAX(c.fast_charger_brand) AS charger_brand,
               MAX(c.fast_charger_type) AS charger_type
             FROM charges c WHERE c.fast_charger_present = true GROUP BY c.charging_process_id
           ) sub ON sub.charging_process_id = cp.id
           WHERE cp.car_id = $1
           ORDER BY cp.start_date DESC`,
          [carId]
        ),
      ]);

      return {
        months: monthRes.rows.map(r => ({
          month: r.month,
          count: r.count,
          total_kwh: parseFloat(parseFloat(r.total_kwh).toFixed(1)),
          peak_kw: r.peak_kw ? parseFloat(parseFloat(r.peak_kw).toFixed(1)) : null,
        })),
        records: recordRes.rows.map(mapRecord),
        has_more: false,
      };
    }, { force }));
  } catch (err) {
    console.error('/api/fast-charges error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
