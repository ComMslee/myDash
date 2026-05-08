// 4개 탭(주행·이력·배터리·집충전소) 헤더/표지용 라이브 메트릭 통합.
// 한 번의 호출로 BottomNavV2 + PeekSheet 가 모든 탭 정보 표시.
// 무거운 분석은 각 탭의 본 API 가 따로 처리.

import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';
import {
  getCache as getChargerCache,
  getTtlInfo as getChargerTtlInfo,
  getLastQuotaHitAt as getChargerLastQuotaHit,
  isFresh as isChargerCacheFresh,
} from '@/lib/home-charger-cache';

export const dynamic = 'force-dynamic';

const KST = 9 * 3600 * 1000;

function kstStartOfTodayUtc() {
  const nowKst = new Date(Date.now() + KST);
  return new Date(Date.UTC(
    nowKst.getUTCFullYear(),
    nowKst.getUTCMonth(),
    nowKst.getUTCDate(),
  ) - KST);
}

function kstStartOfThisWeekUtc() {
  const nowKst = new Date(Date.now() + KST);
  const dow = nowKst.getUTCDay();
  const offsetToMon = dow === 0 ? -6 : 1 - dow;
  return new Date(Date.UTC(
    nowKst.getUTCFullYear(),
    nowKst.getUTCMonth(),
    nowKst.getUTCDate() + offsetToMon,
  ) - KST);
}

export async function GET() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;

  try {
    const car = await getDefaultCar();
    if (!car) return Response.json({ error: 'No car found' }, { status: 404 });
    const carId = car.id;

    const todayUTC = kstStartOfTodayUtc();
    const weekMonUTC = kstStartOfThisWeekUtc();

    const [todayDrives, weekDrives, lastDrive, charging, latestPos, todayPollLog] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS n,
                COALESCE(SUM(distance), 0)::float AS km,
                COALESCE(SUM(duration_min), 0)::int AS dur
         FROM drives WHERE car_id = $1 AND start_date >= $2`,
        [carId, todayUTC.toISOString()],
      ),
      pool.query(
        `SELECT COUNT(*)::int AS n,
                COALESCE(SUM(distance), 0)::float AS km
         FROM drives WHERE car_id = $1 AND start_date >= $2`,
        [carId, weekMonUTC.toISOString()],
      ),
      pool.query(
        `SELECT id, start_date, end_date,
                distance::float AS distance,
                duration_min::int AS duration_min,
                (SELECT display_name FROM addresses WHERE id = drives.start_address_id) AS start_addr,
                (SELECT display_name FROM addresses WHERE id = drives.end_address_id) AS end_addr
         FROM drives WHERE car_id = $1 ORDER BY start_date DESC LIMIT 1`,
        [carId],
      ),
      pool.query(
        `SELECT cp.id, cp.start_date, cp.charge_energy_added,
           (SELECT charger_power FROM charges WHERE charging_process_id = cp.id ORDER BY date DESC LIMIT 1) AS charger_power,
           (SELECT battery_level FROM charges WHERE charging_process_id = cp.id ORDER BY date DESC LIMIT 1) AS charge_battery_level
         FROM charging_processes cp
         WHERE cp.car_id = $1 AND cp.end_date IS NULL
         ORDER BY cp.start_date DESC LIMIT 1`,
        [carId],
      ),
      pool.query(
        `SELECT battery_level, date, power
         FROM positions
         WHERE car_id = $1 AND battery_level IS NOT NULL
         ORDER BY date DESC LIMIT 1`,
        [carId],
      ),
      // 오늘 폴링 성공률
      pool.query(
        `SELECT
           COALESCE(SUM(attempts), 0)::int AS attempts,
           COALESCE(SUM(successes), 0)::int AS successes,
           COALESCE(SUM(partial), 0)::int AS partial,
           COALESCE(SUM(quota_hits), 0)::int AS quota_hits,
           MAX(hour) AS last_hour
         FROM home_charger_poll_log
         WHERE date = (NOW() AT TIME ZONE 'Asia/Seoul')::date`,
      ).catch(() => ({ rows: [{ attempts: 0, successes: 0, partial: 0, quota_hits: 0, last_hour: null }] })),
    ]);

    const ch = charging.rows[0];
    const isCharging = !!ch;
    const lp = latestPos.rows[0];

    // chargers 캐시 상태
    const chargerCache = getChargerCache();
    const chargerTtl = getChargerTtlInfo();
    const chargerData = chargerCache?.data;
    const stations = chargerData?.stations || [];

    // 폴링 성공률 (오늘 누적, %)
    const pl = todayPollLog.rows[0];
    const pollAttempts = pl.attempts || 0;
    const pollSuccessRate = pollAttempts > 0
      ? Math.round(((pl.successes || 0) + (pl.partial || 0) * 0.5) / pollAttempts * 100)
      : null;

    return Response.json({
      drives: {
        today_km: parseFloat((todayDrives.rows[0].km || 0).toFixed(1)),
        today_count: todayDrives.rows[0].n || 0,
        today_duration_min: todayDrives.rows[0].dur || 0,
      },
      history: {
        week_count: weekDrives.rows[0].n || 0,
        week_km: parseFloat((weekDrives.rows[0].km || 0).toFixed(1)),
        latest: lastDrive.rows[0] ? {
          start: lastDrive.rows[0].start_date,
          end: lastDrive.rows[0].end_date,
          distance: lastDrive.rows[0].distance,
          duration_min: lastDrive.rows[0].duration_min,
          start_addr: lastDrive.rows[0].start_addr,
          end_addr: lastDrive.rows[0].end_addr,
        } : null,
      },
      battery: {
        soc: lp?.battery_level ?? null,
        last_position_at: lp?.date ?? null,
        latest_power_kw: lp?.power != null ? parseFloat(lp.power) : null,
        charging: isCharging,
        charger_power_kw: ch?.charger_power != null ? parseFloat(ch.charger_power) : null,
        charge_added_kwh: ch?.charge_energy_added != null
          ? parseFloat(parseFloat(ch.charge_energy_added).toFixed(2)) : 0,
        charging_start: ch?.start_date ?? null,
      },
      chargers: {
        last_fetched: chargerData?.fetchedAt ?? null,
        ttl_min: chargerTtl?.currentMin ?? null,
        last_quota_hit: getChargerLastQuotaHit() || null,
        is_fresh: isChargerCacheFresh(),
        stations_count: stations.length,
        success_rate_today: pollSuccessRate,
        poll_attempts_today: pollAttempts,
      },
    });
  } catch (e) {
    console.error('/api/v2/quick-status error:', e);
    return Response.json({ error: 'DB error', detail: e.message }, { status: 500 });
  }
}
