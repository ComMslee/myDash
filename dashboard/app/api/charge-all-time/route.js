import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';
import { withCache } from '@/lib/server-cache';
import { ensureSchema, bootstrapIfEmpty } from '@/lib/dash-agg';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const force = new URL(request.url).searchParams.get('refresh') === '1';
  try {
    const car = await getDefaultCar();
    if (!car) return Response.json({ error: 'No car found' }, { status: 404 });
    const carId = car.id;

    await ensureSchema();
    await bootstrapIfEmpty(carId);

    return Response.json(await withCache(`charge-all-time:${carId}`, 600_000, async () => {
    const [statsResult, hourDowResult] = await Promise.all([
      // 사전 집계 SUM — 전체 기간 (오늘 포함, 같은 cron 으로 갱신)
      pool.query(`
        SELECT
          COALESCE(SUM(charge_count), 0)::int     AS charge_count,
          COALESCE(SUM(energy_kwh), 0)::float     AS total_kwh,
          COALESCE(SUM(home_count), 0)::int       AS home_charges,
          COALESCE(SUM(charge_count - home_count), 0)::int AS other_charges,
          COALESCE(SUM(fast_count), 0)::int       AS fast_charges,
          COALESCE(SUM(charge_count - fast_count), 0)::int AS slow_charges
        FROM dash_daily_charge_agg
        WHERE car_id = $1
      `, [carId]),
      // hour×dow 그리드: SUM(ticks_10min)
      pool.query(`
        SELECT dow, hour, SUM(ticks_10min)::int AS count
          FROM dash_daily_charge_agg
         WHERE car_id = $1
         GROUP BY dow, hour
      `, [carId]),
    ]);

    const s = statsResult.rows[0];
    const totalKwh = parseFloat(s.total_kwh) || 0;
    const chargeCount = parseInt(s.charge_count) || 0;
    const avgKwh = chargeCount > 0 ? (totalKwh / chargeCount) : 0;

    const hourDow = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const r of hourDowResult.rows) hourDow[r.dow][r.hour] = r.count;

    return {
      charge_count: chargeCount,
      total_kwh: parseFloat(totalKwh.toFixed(1)),
      avg_kwh: parseFloat(avgKwh.toFixed(1)),
      home_charges: s.home_charges,
      other_charges: s.other_charges,
      fast_charges: s.fast_charges,
      slow_charges: s.slow_charges,
      charge_hour_dow: hourDow,
    };
    }, { force }));
  } catch (err) {
    console.error('/api/charge-all-time error:', err);
    return Response.json({ error: 'DB error' }, { status: 500 });
  }
}
