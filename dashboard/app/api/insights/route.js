import pool from '@/lib/db';
import { KWH_PER_KM } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const car = await pool.query(`SELECT id FROM cars LIMIT 1`);
    if (car.rows.length === 0) {
      return Response.json({ error: 'No car found' }, { status: 404 });
    }
    const carId = car.rows[0].id;

    const now = new Date();
    const nextStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const twelveMonthStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const iso = (d) => d.toISOString();

    const monthStats = async (start, end) => {
      const q = await pool.query(
        `SELECT
           COALESCE(SUM(distance), 0)::float AS distance,
           COUNT(*)::int AS drive_count,
           COALESCE(SUM(duration_min), 0)::int AS duration_min,
           COALESCE(MAX(distance), 0)::float AS max_distance,
           COALESCE(MAX(duration_min), 0)::int AS max_duration,
           COALESCE(MAX(speed_max), 0)::int AS max_speed,
           COALESCE(SUM(
             CASE
               WHEN start_rated_range_km IS NOT NULL AND end_rated_range_km IS NOT NULL
               THEN (start_rated_range_km - end_rated_range_km)
               ELSE 0
             END
           ), 0)::float AS total_range_used
         FROM drives
         WHERE car_id = $1 AND start_date >= $2 AND start_date < $3`,
        [carId, iso(start), iso(end)]
      );
      const chargeQ = await pool.query(
        `SELECT
           COALESCE(SUM(charge_energy_added), 0)::float AS total_kwh,
           COUNT(*)::int AS charge_count,
           COALESCE(AVG(charge_energy_added), 0)::float AS avg_kwh,
           COUNT(*) FILTER (WHERE geofence_id IS NOT NULL)::int AS home_charges,
           COUNT(*) FILTER (WHERE geofence_id IS NULL)::int AS other_charges,
           COUNT(*) FILTER (WHERE is_fast = true)::int AS fast_charges,
           COUNT(*) FILTER (WHERE is_fast IS DISTINCT FROM true)::int AS slow_charges
         FROM (
           SELECT cp.charge_energy_added, cp.geofence_id,
                  COALESCE(BOOL_OR(c.fast_charger_present), false) AS is_fast
           FROM charging_processes cp
           LEFT JOIN charges c ON c.charging_process_id = cp.id
           WHERE cp.car_id = $1 AND cp.start_date >= $2 AND cp.start_date < $3
             AND cp.charge_energy_added IS NOT NULL
           GROUP BY cp.id, cp.charge_energy_added, cp.geofence_id
         ) sub`,
        [carId, iso(start), iso(end)]
      );
      return { ...q.rows[0], ...chargeQ.rows[0] };
    };

    // 12개월 각 월 통계 + 패턴 쿼리 동시 실행 (패턴은 전체 기간)
    const [
      twelveMonthBreakdown, hourly, weekday, chargeHourly, chargeWeekday,
      allTimeDrive, allTimeCharge, dayMaxResult,
    ] = await Promise.all([
      Promise.all(
        Array.from({ length: 12 }, (_, i) => {
          const ms = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
          const me = new Date(now.getFullYear(), now.getMonth() - (11 - i) + 1, 1);
          return monthStats(ms, me).then(s => ({ year: ms.getFullYear(), month: ms.getMonth() + 1, ...s }));
        })
      ),
      // 시간대 주행 (전체 기간)
      pool.query(
        `SELECT EXTRACT(HOUR FROM (start_date + INTERVAL '9 hours'))::int AS hour,
                COUNT(*)::int AS count,
                COALESCE(SUM(distance), 0)::float AS distance
         FROM drives
         WHERE car_id = $1
         GROUP BY hour ORDER BY hour`,
        [carId]
      ),
      // 요일 주행 (전체 기간)
      pool.query(
        `SELECT EXTRACT(DOW FROM (start_date + INTERVAL '9 hours'))::int AS dow,
                COUNT(*)::int AS count,
                COALESCE(SUM(distance), 0)::float AS distance
         FROM drives
         WHERE car_id = $1
         GROUP BY dow ORDER BY dow`,
        [carId]
      ),
      // 시간대 충전 (전체 기간)
      pool.query(
        `SELECT EXTRACT(HOUR FROM (start_date + INTERVAL '9 hours'))::int AS hour,
                COUNT(*)::int AS count,
                COALESCE(SUM(charge_energy_added), 0)::float AS kwh
         FROM charging_processes
         WHERE car_id = $1
           AND charge_energy_added IS NOT NULL
         GROUP BY hour ORDER BY hour`,
        [carId]
      ),
      // 요일 충전 (전체 기간)
      pool.query(
        `SELECT EXTRACT(DOW FROM (start_date + INTERVAL '9 hours'))::int AS dow,
                COUNT(*)::int AS count,
                COALESCE(SUM(charge_energy_added), 0)::float AS kwh
         FROM charging_processes
         WHERE car_id = $1
           AND charge_energy_added IS NOT NULL
         GROUP BY dow ORDER BY dow`,
        [carId]
      ),
      // 전체 기간 주행 집계
      pool.query(
        `SELECT
           COALESCE(SUM(distance), 0)::float AS distance,
           COUNT(*)::int AS drive_count,
           COALESCE(SUM(duration_min), 0)::int AS duration_min,
           COALESCE(MAX(distance), 0)::float AS max_distance,
           COALESCE(MAX(duration_min), 0)::int AS max_duration,
           COALESCE(MAX(speed_max), 0)::int AS max_speed,
           COALESCE(SUM(
             CASE
               WHEN start_rated_range_km IS NOT NULL AND end_rated_range_km IS NOT NULL
               THEN (start_rated_range_km - end_rated_range_km)
               ELSE 0
             END
           ), 0)::float AS total_range_used
         FROM drives
         WHERE car_id = $1`,
        [carId]
      ),
      // 전체 기간 충전 집계
      pool.query(
        `SELECT
           COALESCE(SUM(charge_energy_added), 0)::float AS total_kwh,
           COUNT(*)::int AS charge_count,
           COALESCE(AVG(charge_energy_added), 0)::float AS avg_kwh,
           COUNT(*) FILTER (WHERE geofence_id IS NOT NULL)::int AS home_charges,
           COUNT(*) FILTER (WHERE geofence_id IS NULL)::int AS other_charges,
           COUNT(*) FILTER (WHERE is_fast = true)::int AS fast_charges,
           COUNT(*) FILTER (WHERE is_fast IS DISTINCT FROM true)::int AS slow_charges
         FROM (
           SELECT cp.charge_energy_added, cp.geofence_id,
                  COALESCE(BOOL_OR(c.fast_charger_present), false) AS is_fast
           FROM charging_processes cp
           LEFT JOIN charges c ON c.charging_process_id = cp.id
           WHERE cp.car_id = $1 AND cp.charge_energy_added IS NOT NULL
           GROUP BY cp.id, cp.charge_energy_added, cp.geofence_id
         ) sub`,
        [carId]
      ),
      // 전체 기간 일별 최대 거리/시간
      pool.query(
        `SELECT MAX(day_distance)::float AS max_day_distance,
                MAX(day_duration)::int AS max_day_duration,
                MAX(day_avg_speed)::float AS max_day_avg_speed
         FROM (
           SELECT DATE(start_date + INTERVAL '9 hours')::text AS day,
                  SUM(distance)::float AS day_distance,
                  SUM(duration_min)::int AS day_duration,
                  CASE WHEN SUM(distance) >= 10 AND SUM(duration_min) > 0
                       THEN SUM(distance) / SUM(duration_min) * 60
                       ELSE NULL
                  END AS day_avg_speed
           FROM drives
           WHERE car_id = $1
           GROUP BY day
         ) sub`,
        [carId]
      ),
    ]);

    // 이번달 / 지난달
    const current = twelveMonthBreakdown[11];
    const previous = twelveMonthBreakdown[10];

    const effCur = current.distance > 0 ? (current.total_range_used * KWH_PER_KM / current.distance * 1000) : 0;
    const effPrev = previous.distance > 0 ? (previous.total_range_used * KWH_PER_KM / previous.distance * 1000) : 0;

    // 기간별 집계 헬퍼
    const aggregate = (months) => {
      const agg = {
        distance: months.reduce((s, m) => s + m.distance, 0),
        drive_count: months.reduce((s, m) => s + m.drive_count, 0),
        duration_min: months.reduce((s, m) => s + m.duration_min, 0),
        total_kwh: months.reduce((s, m) => s + m.total_kwh, 0),
        charge_count: months.reduce((s, m) => s + m.charge_count, 0),
        home_charges: months.reduce((s, m) => s + m.home_charges, 0),
        other_charges: months.reduce((s, m) => s + m.other_charges, 0),
        fast_charges: months.reduce((s, m) => s + (m.fast_charges || 0), 0),
        slow_charges: months.reduce((s, m) => s + (m.slow_charges || 0), 0),
        total_range_used: months.reduce((s, m) => s + m.total_range_used, 0),
        max_distance: Math.max(0, ...months.map(m => m.max_distance)),
        max_duration: Math.max(0, ...months.map(m => m.max_duration)),
        max_speed: Math.max(0, ...months.map(m => m.max_speed)),
      };
      const avg_speed = agg.duration_min > 0 ? parseFloat((agg.distance / Math.max(1, agg.duration_min) * 60).toFixed(1)) : 0;
      const eff = agg.distance > 0 ? (agg.total_range_used * KWH_PER_KM / agg.distance * 1000) : 0;
      return {
        distance: parseFloat(agg.distance.toFixed(1)),
        drive_count: agg.drive_count,
        duration_min: agg.duration_min,
        total_kwh: parseFloat(agg.total_kwh.toFixed(1)),
        charge_count: agg.charge_count,
        avg_kwh: agg.charge_count > 0 ? parseFloat((agg.total_kwh / agg.charge_count).toFixed(1)) : 0,
        home_charges: agg.home_charges,
        other_charges: agg.other_charges,
        fast_charges: agg.fast_charges,
        slow_charges: agg.slow_charges,
        max_distance: parseFloat(agg.max_distance.toFixed(1)),
        max_duration: agg.max_duration,
        max_speed: agg.max_speed,
        avg_speed,
        efficiency_wh_km: parseFloat(eff.toFixed(0)),
      };
    };

    // 전체 기간 집계
    const at = allTimeDrive.rows[0];
    const ac = allTimeCharge.rows[0];
    const dayMax = dayMaxResult.rows[0] || {};
    const allTimeAvgSpeed = at.duration_min > 0 ? parseFloat((at.distance / Math.max(1, at.duration_min) * 60).toFixed(1)) : 0;
    const allTimeEff = at.distance > 0 ? (at.total_range_used * KWH_PER_KM / at.distance * 1000) : 0;

    const allTime = {
      distance: parseFloat(at.distance.toFixed(1)),
      drive_count: at.drive_count,
      duration_min: at.duration_min,
      total_kwh: parseFloat(ac.total_kwh.toFixed(1)),
      charge_count: ac.charge_count,
      avg_kwh: ac.charge_count > 0 ? parseFloat((ac.total_kwh / ac.charge_count).toFixed(1)) : 0,
      home_charges: ac.home_charges,
      other_charges: ac.other_charges,
      fast_charges: ac.fast_charges,
      slow_charges: ac.slow_charges,
      max_distance: parseFloat(at.max_distance.toFixed(1)),
      max_duration: at.max_duration,
      max_speed: at.max_speed,
      avg_speed: allTimeAvgSpeed,
      efficiency_wh_km: parseFloat(allTimeEff.toFixed(0)),
      max_day_distance: dayMax.max_day_distance != null ? parseFloat(parseFloat(dayMax.max_day_distance).toFixed(1)) : 0,
      max_day_duration: dayMax.max_day_duration != null ? parseInt(dayMax.max_day_duration) : 0,
      max_day_avg_speed: dayMax.max_day_avg_speed != null ? parseFloat(parseFloat(dayMax.max_day_avg_speed).toFixed(1)) : null,
    };

    return Response.json({
      current: {
        distance: parseFloat(current.distance.toFixed(1)),
        drive_count: current.drive_count,
        duration_min: current.duration_min,
        total_kwh: parseFloat(current.total_kwh.toFixed(1)),
        charge_count: current.charge_count,
        avg_kwh: parseFloat(current.avg_kwh.toFixed(1)),
        home_charges: current.home_charges,
        other_charges: current.other_charges,
        max_distance: parseFloat(current.max_distance.toFixed(1)),
        max_duration: current.max_duration,
        max_speed: current.max_speed,
        efficiency_wh_km: parseFloat(effCur.toFixed(0)),
      },
      previous: {
        distance: parseFloat(previous.distance.toFixed(1)),
        drive_count: previous.drive_count,
        total_kwh: parseFloat(previous.total_kwh.toFixed(1)),
        charge_count: previous.charge_count,
        efficiency_wh_km: parseFloat(effPrev.toFixed(0)),
      },
      threeMonth: aggregate(twelveMonthBreakdown.slice(9)),
      sixMonth:   aggregate(twelveMonthBreakdown.slice(6)),
      twelveMonth: aggregate(twelveMonthBreakdown),
      allTime,
      monthlyBreakdown: twelveMonthBreakdown.map(m => ({
        year: m.year,
        month: m.month,
        distance: parseFloat(m.distance.toFixed(1)),
        drive_count: m.drive_count,
        total_kwh: parseFloat(m.total_kwh.toFixed(1)),
        charge_count: m.charge_count,
      })),
      hourly: Array.from({ length: 24 }, (_, h) => {
        const row = hourly.rows.find(r => r.hour === h);
        return { hour: h, count: row?.count || 0, distance: row ? parseFloat(row.distance.toFixed(1)) : 0 };
      }),
      weekday: Array.from({ length: 7 }, (_, d) => {
        const row = weekday.rows.find(r => r.dow === d);
        return { dow: d, count: row?.count || 0, distance: row ? parseFloat(row.distance.toFixed(1)) : 0 };
      }),
      charge_hourly: Array.from({ length: 24 }, (_, h) => {
        const row = chargeHourly.rows.find(r => r.hour === h);
        return { hour: h, count: row?.count || 0, kwh: row ? parseFloat(row.kwh.toFixed(1)) : 0 };
      }),
      charge_weekday: Array.from({ length: 7 }, (_, d) => {
        const row = chargeWeekday.rows.find(r => r.dow === d);
        return { dow: d, count: row?.count || 0, kwh: row ? parseFloat(row.kwh.toFixed(1)) : 0 };
      }),
    });
  } catch (err) {
    console.error('/api/insights error:', err);
    return Response.json({ error: 'DB error' }, { status: 500 });
  }
}
