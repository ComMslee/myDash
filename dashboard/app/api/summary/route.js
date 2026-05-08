import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';
import { KWH_PER_KM } from '@/lib/constants';

export const dynamic = 'force-dynamic';

// drives + charging_processes 일자 집계 — 봇 /period 공용.
// drives 응답에 efficiency_wh_km(전비) 도 같이 — (range_used) * KWH_PER_KM / distance * 1000.
// range:
//   today        오늘 (KST 자정~)
//   yesterday    어제 (KST)
//   week         지난 7일 (오늘 포함)
//   this-week    이번 주 (KST 월요일~오늘)
//   last-week    지난 주 (KST 월요일~일요일)
//   month        이번 달 (KST 1일~오늘)
//   last-month   지난 달 (KST 1일~말일)
//   multi        today + this-week + month + last-month 한 번에 — 봇 /period 용.

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
    // 캘린더 월은 월초 빈약 → 최근 4주(28일) 롤링 + 그 직전 4주.
    case 'rolling-4w':      return [new Date(today.getTime() - 28 * 86_400_000), null];
    case 'prev-rolling-4w': return [new Date(today.getTime() - 56 * 86_400_000), new Date(today.getTime() - 28 * 86_400_000)];
    // 평일 5일 요약 (이번 주 월~금) — 토요일 09:00 KST 텔레그램 봇 발송용.
    case 'weekdays': {
      const mon = kstStartOfThisWeekUtc();
      const sat = new Date(mon.getTime() + 5 * 86_400_000);
      return [mon, sat];
    }
    // 주말 2일 요약 (직전 토·일) — 월요일 09:00 KST 발송용.
    case 'weekend': {
      const thisMon = kstStartOfThisWeekUtc();
      const lastSat = new Date(thisMon.getTime() - 2 * 86_400_000);
      return [lastSat, thisMon];
    }
    default: return null;
  }
}

async function aggregateRange(carId, start, end) {
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
  // 전비 (Wh/km) — range_used 기반. 노이즈 방지 위해 km>=1 일 때만.
  const eff = d.km >= 1 ? (d.range_used * KWH_PER_KM / d.km * 1000) : 0;
  return {
    drives: {
      n: d.n,
      km: d.km,
      dur: d.dur,
      eff_wh_km: Math.round(eff),
    },
    charges: charges.rows[0],
  };
}

export async function GET(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  try {
    const { searchParams } = new URL(req.url);
    const range = (searchParams.get('range') || 'today').toLowerCase();

    const car = await getDefaultCar();
    if (!car) return Response.json({ error: 'No car found' }, { status: 404 });

    const today = kstStartOfTodayUtc();

    if (range === 'multi') {
      const ranges = ['today', 'this-week', 'last-week', 'rolling-4w', 'prev-rolling-4w'];
      const out = {};
      await Promise.all(ranges.map(async (r) => {
        const b = rangeBounds(r, today);
        if (!b) return;
        // 키 변환: 'rolling-4w' → 'rolling_4w' 등 (단 prev-rolling-4w → prev_rolling_4w).
        out[r.replace(/-/g, '_')] = await aggregateRange(car.id, b[0], b[1]);
      }));
      return Response.json({ range: 'multi', ...out });
    }

    const b = rangeBounds(range, today);
    if (!b) return Response.json({ error: 'bad range' }, { status: 400 });

    const agg = await aggregateRange(car.id, b[0], b[1]);
    return Response.json({ range, ...agg });
  } catch (e) {
    console.error('/api/summary error:', e);
    return Response.json({ error: 'DB error', detail: e.message }, { status: 500 });
  }
}
