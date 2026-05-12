import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';
import { KWH_PER_KM } from '@/lib/constants';
import { withCache } from '@/lib/server-cache';
import { TTL_120S } from '@/lib/cache-ttls';
import { ensureSchema, bootstrapIfEmpty } from '@/lib/dash-agg';

export const dynamic = 'force-dynamic';

const KST_OFFSET_MS = 9 * 3600 * 1000;

function kstStartOfTodayUtc() {
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  return new Date(Date.UTC(
    nowKst.getUTCFullYear(),
    nowKst.getUTCMonth(),
    nowKst.getUTCDate(),
  ) - KST_OFFSET_MS);
}

function kstStartOfThisWeekUtc() {
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  const dow = nowKst.getUTCDay();
  const offsetToMon = dow === 0 ? -6 : 1 - dow;
  return new Date(Date.UTC(
    nowKst.getUTCFullYear(),
    nowKst.getUTCMonth(),
    nowKst.getUTCDate() + offsetToMon,
  ) - KST_OFFSET_MS);
}

function kstStartOfThisMonthUtc() {
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  return new Date(Date.UTC(
    nowKst.getUTCFullYear(),
    nowKst.getUTCMonth(),
    1,
  ) - KST_OFFSET_MS);
}

function kstStartOfLastMonthUtc() {
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  return new Date(Date.UTC(
    nowKst.getUTCFullYear(),
    nowKst.getUTCMonth() - 1,
    1,
  ) - KST_OFFSET_MS);
}

function rangeBounds(range, today) {
  switch (range) {
    case 'today':           return [today, null];
    case 'yesterday':       return [new Date(today.getTime() - 86_400_000), today];
    case 'week':            return [new Date(today.getTime() - 6 * 86_400_000), null];
    case 'this-week':       return [kstStartOfThisWeekUtc(), null];
    case 'last-week': {
      const thisMon = kstStartOfThisWeekUtc();
      return [new Date(thisMon.getTime() - 7 * 86_400_000), thisMon];
    }
    case 'month':           return [kstStartOfThisMonthUtc(), null];
    case 'last-month':      return [kstStartOfLastMonthUtc(), kstStartOfThisMonthUtc()];
    case 'rolling-4w':      return [new Date(today.getTime() - 28 * 86_400_000), null];
    case 'prev-rolling-4w': return [new Date(today.getTime() - 56 * 86_400_000), new Date(today.getTime() - 28 * 86_400_000)];
    case 'weekdays': {
      const mon = kstStartOfThisWeekUtc();
      const sat = new Date(mon.getTime() + 5 * 86_400_000);
      return [mon, sat];
    }
    case 'weekend': {
      const thisMon = kstStartOfThisWeekUtc();
      const lastSat = new Date(thisMon.getTime() - 2 * 86_400_000);
      return [lastSat, thisMon];
    }
    default: return null;
  }
}

// UTC Date → KST 'YYYY-MM-DD'
function kstDayString(utcDate) {
  const k = new Date(utcDate.getTime() + KST_OFFSET_MS);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, '0')}-${String(k.getUTCDate()).padStart(2, '0')}`;
}

// 사전 집계 SUM — [fromDayKst, toDayKst) (toDay=null => 오늘 포함)
async function aggregateFromDaily(carId, fromUtc, endUtc, todayUtc) {
  // KST day 범위 계산
  const fromDay = kstDayString(fromUtc);
  // endUtc null → today 포함이므로 +1 일 (오늘 KST date+1)
  const toDay = endUtc ? kstDayString(endUtc) : kstDayString(new Date(todayUtc.getTime() + 86_400_000));
  const [drive, charge] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(drive_count), 0)::int  AS n,
              COALESCE(SUM(distance_km), 0)::float AS km,
              COALESCE(SUM(duration_min), 0)::int  AS dur,
              COALESCE(SUM(used_km), 0)::float     AS range_used
         FROM dash_daily_drive_agg
        WHERE car_id = $1 AND day >= $2::date AND day < $3::date`,
      [carId, fromDay, toDay]
    ),
    pool.query(
      `SELECT COALESCE(SUM(charge_count), 0)::int AS n,
              COALESCE(SUM(energy_kwh), 0)::float AS kwh
         FROM dash_daily_charge_agg
        WHERE car_id = $1 AND day >= $2::date AND day < $3::date`,
      [carId, fromDay, toDay]
    ),
  ]);
  const d = drive.rows[0];
  const c = charge.rows[0];
  const eff = d.km >= 1 ? (d.range_used * KWH_PER_KM / d.km * 1000) : 0;
  return {
    drives: { n: d.n, km: d.km, dur: d.dur, eff_wh_km: Math.round(eff) },
    charges: { n: c.n, kwh: c.kwh },
  };
}

// 라이브 라우트 (오늘/이번주/롤링4w 처럼 오늘 미포함되면 안 되는 범위)
async function aggregateLive(carId, start, end) {
  const where = end ? 'start_date >= $2 AND start_date < $3' : 'start_date >= $2';
  const params = end ? [carId, start, end] : [carId, start];
  const [drives, charges] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS n,
              COALESCE(SUM(distance), 0)::float AS km,
              COALESCE(SUM(duration_min), 0)::int AS dur,
              COALESCE(SUM(start_rated_range_km - end_rated_range_km), 0)::float AS range_used
       FROM drives WHERE car_id = $1 AND ${where}`,
      params,
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n,
              COALESCE(SUM(charge_energy_added), 0)::float AS kwh
       FROM charging_processes WHERE car_id = $1 AND ${where}`,
      params,
    ),
  ]);
  const d = drives.rows[0];
  const eff = d.km >= 1 ? (d.range_used * KWH_PER_KM / d.km * 1000) : 0;
  return {
    drives: { n: d.n, km: d.km, dur: d.dur, eff_wh_km: Math.round(eff) },
    charges: charges.rows[0],
  };
}

// 사전 집계가 안전한 범위 — 모두 과거 (오늘 비포함)
const HISTORICAL_RANGES = new Set(['yesterday', 'last-week', 'last-month', 'prev-rolling-4w', 'weekend']);

async function aggregateRange(carId, start, end, today) {
  // end != null 이고 end <= today 면 historical (오늘 비포함) → daily-agg 가능
  if (end && end.getTime() <= today.getTime()) {
    return aggregateFromDaily(carId, start, end, today);
  }
  return aggregateLive(carId, start, end);
}

const CACHEABLE_RANGES = new Set(['multi', 'last-week', 'last-month', 'prev-rolling-4w', 'yesterday']);

export async function GET(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const force = new URL(req.url).searchParams.get('refresh') === '1';
  try {
    const { searchParams } = new URL(req.url);
    const range = (searchParams.get('range') || 'today').toLowerCase();

    const car = await getDefaultCar();
    if (!car) return Response.json({ error: 'No car found' }, { status: 404 });

    const today = kstStartOfTodayUtc();

    await ensureSchema();
    await bootstrapIfEmpty(car.id);

    if (range === 'multi') {
      const cacheKey = `summary:${car.id}:multi`;
      return Response.json(await withCache(cacheKey, TTL_120S, async () => {
        const ranges = ['today', 'this-week', 'last-week', 'rolling-4w', 'prev-rolling-4w'];
        const out = {};
        await Promise.all(ranges.map(async (r) => {
          const b = rangeBounds(r, today);
          if (!b) return;
          out[r.replace(/-/g, '_')] = await aggregateRange(car.id, b[0], b[1], today);
        }));
        return { range: 'multi', ...out };
      }, { force }));
    }

    const b = rangeBounds(range, today);
    if (!b) return Response.json({ error: 'bad range' }, { status: 400 });

    if (CACHEABLE_RANGES.has(range)) {
      const cacheKey = `summary:${car.id}:${range}`;
      return Response.json(await withCache(cacheKey, TTL_120S, async () => {
        const agg = await aggregateRange(car.id, b[0], b[1], today);
        return { range, ...agg };
      }, { force }));
    }

    const agg = await aggregateRange(car.id, b[0], b[1], today);
    return Response.json({ range, ...agg });
  } catch (e) {
    console.error('/api/summary error:', e);
    return Response.json({ error: 'DB error', detail: e.message }, { status: 500 });
  }
}
