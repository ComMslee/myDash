import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

// 추천 충전 임계값 (Tesla 일상 주행 권장 하한)
const CHARGE_THRESHOLD_PCT = 20;
// 일일 평균 소모율 계산을 위한 과거 윈도우
const USAGE_LOOKBACK_DAYS = 14;

export async function GET() {
  try {
    const carResult = await pool.query(`SELECT id, name FROM cars LIMIT 1`);
    if (carResult.rows.length === 0) {
      return Response.json({ error: 'No car found' }, { status: 404 });
    }

    const car = carResult.rows[0];
    const carId = car.id;

    const [posResult, stateResult, lastChargeResult, usageResult] = await Promise.all([
      pool.query(
        `SELECT battery_level, est_battery_range_km, rated_battery_range_km, date
         FROM positions WHERE car_id = $1 ORDER BY date DESC LIMIT 1`,
        [carId]
      ),
      pool.query(
        `SELECT state FROM states WHERE car_id = $1 ORDER BY start_date DESC LIMIT 1`,
        [carId]
      ),
      pool.query(
        `SELECT cp.end_date, cp.start_battery_level, cp.end_battery_level,
                g.name AS geofence_name
         FROM charging_processes cp
         LEFT JOIN geofences g ON g.id = cp.geofence_id
         WHERE cp.car_id = $1 AND cp.end_date IS NOT NULL
         ORDER BY cp.end_date DESC LIMIT 1`,
        [carId]
      ),
      pool.query(
        `SELECT COALESCE(SUM(
           CASE WHEN sp.battery_level IS NOT NULL AND ep.battery_level IS NOT NULL
                AND sp.battery_level > ep.battery_level
                THEN sp.battery_level - ep.battery_level ELSE 0 END
         ), 0)::float AS battery_used_pct,
         COUNT(*)::int AS drive_count
         FROM drives d
         LEFT JOIN positions sp ON sp.id = d.start_position_id
         LEFT JOIN positions ep ON ep.id = d.end_position_id
         WHERE d.car_id = $1 AND d.start_date >= NOW() - ($2 || ' days')::interval`,
        [carId, USAGE_LOOKBACK_DAYS]
      ),
    ]);

    const pos = posResult.rows[0];
    const currentState = stateResult.rows[0]?.state || 'unknown';

    // 추천 충전일 계산: 최근 14일 일일 평균 SoC 소모율 기준
    let estimated_charge_date = null;
    let estimated_days_until_charge = null;
    const currentBattery = pos?.battery_level ?? null;
    const batteryUsedPct = usageResult.rows[0]?.battery_used_pct ?? 0;
    const driveCount = usageResult.rows[0]?.drive_count ?? 0;
    const dailyPctUsage = batteryUsedPct / USAGE_LOOKBACK_DAYS;

    if (
      currentBattery != null &&
      currentState !== 'charging' &&
      dailyPctUsage > 0 &&
      driveCount > 0
    ) {
      const remainingPct = currentBattery - CHARGE_THRESHOLD_PCT;
      const daysRaw = remainingPct > 0 ? remainingPct / dailyPctUsage : 0;
      estimated_days_until_charge = Math.max(0, Math.round(daysRaw));
      const target = new Date();
      target.setDate(target.getDate() + estimated_days_until_charge);
      estimated_charge_date = target.toISOString();
    }

    return Response.json({
      id: carId,
      name: car.name,
      battery_level: currentBattery,
      est_battery_range: pos?.est_battery_range_km ? parseFloat(pos.est_battery_range_km).toFixed(0) : null,
      rated_battery_range: pos?.rated_battery_range_km ? parseFloat(pos.rated_battery_range_km).toFixed(0) : null,
      state: currentState,
      last_seen: pos?.date ?? null,
      last_charge: lastChargeResult.rows[0] ? {
        end_date: lastChargeResult.rows[0].end_date,
        soc_start: lastChargeResult.rows[0].start_battery_level,
        soc_end: lastChargeResult.rows[0].end_battery_level,
        location: lastChargeResult.rows[0].geofence_name || null,
      } : null,
      estimated_charge: estimated_charge_date ? {
        date: estimated_charge_date,
        days_until: estimated_days_until_charge,
        threshold_pct: CHARGE_THRESHOLD_PCT,
      } : null,
    });
  } catch (err) {
    console.error('/api/car error:', err);
    return Response.json({ error: 'DB error' }, { status: 500 });
  }
}
