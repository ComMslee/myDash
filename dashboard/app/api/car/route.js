import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

// ── 추천 충전일 계산 파라미터 ─────────────────────────────
// A안(유휴 포함) + D안(EMA 가중) + C안(임계값 학습)
const LOOKBACK_DAYS = 14;              // 전체 관측 기간
const RECENT_DAYS = 3;                 // 가중치 높이는 최근 기간
const RECENT_WEIGHT = 2;               // 최근 구간 가중치
const OLDER_WEIGHT = 1;                // 이전 구간 가중치
const THRESHOLD_LOOKBACK_DAYS = 90;    // 임계값 학습 기간
const MIN_CHARGES_FOR_LEARNING = 5;    // 학습 최소 표본 수
const THRESHOLD_MIN_PCT = 15;          // 학습 임계값 하한(안전)
const THRESHOLD_MAX_PCT = 50;          // 학습 임계값 상한
const DEFAULT_THRESHOLD_PCT = 20;      // 학습 실패 시 기본값

export async function GET() {
  try {
    const carResult = await pool.query(`SELECT id, name FROM cars LIMIT 1`);
    if (carResult.rows.length === 0) {
      return Response.json({ error: 'No car found' }, { status: 404 });
    }

    const car = carResult.rows[0];
    const carId = car.id;

    const [
      posResult,
      stateResult,
      lastChargeResult,
      socPastFullResult,
      socPastRecentResult,
      chargesFullResult,
      chargesRecentResult,
      thresholdResult,
    ] = await Promise.all([
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
      // LOOKBACK_DAYS 전 시점의 SoC (그 시점 이전 가장 가까운 positions)
      pool.query(
        `SELECT battery_level FROM positions
         WHERE car_id = $1 AND battery_level IS NOT NULL
           AND date <= NOW() - ($2 || ' days')::interval
         ORDER BY date DESC LIMIT 1`,
        [carId, LOOKBACK_DAYS]
      ),
      // RECENT_DAYS 전 시점의 SoC
      pool.query(
        `SELECT battery_level FROM positions
         WHERE car_id = $1 AND battery_level IS NOT NULL
           AND date <= NOW() - ($2 || ' days')::interval
         ORDER BY date DESC LIMIT 1`,
        [carId, RECENT_DAYS]
      ),
      // LOOKBACK_DAYS ~ RECENT_DAYS 구간 충전량 (SoC %)
      pool.query(
        `SELECT COALESCE(SUM(end_battery_level - start_battery_level), 0)::float AS soc_added
         FROM charging_processes
         WHERE car_id = $1
           AND end_date >= NOW() - ($2 || ' days')::interval
           AND end_date <  NOW() - ($3 || ' days')::interval
           AND start_battery_level IS NOT NULL
           AND end_battery_level IS NOT NULL
           AND end_battery_level > start_battery_level`,
        [carId, LOOKBACK_DAYS, RECENT_DAYS]
      ),
      // 최근 RECENT_DAYS 구간 충전량 (SoC %)
      pool.query(
        `SELECT COALESCE(SUM(end_battery_level - start_battery_level), 0)::float AS soc_added
         FROM charging_processes
         WHERE car_id = $1
           AND end_date >= NOW() - ($2 || ' days')::interval
           AND start_battery_level IS NOT NULL
           AND end_battery_level IS NOT NULL
           AND end_battery_level > start_battery_level`,
        [carId, RECENT_DAYS]
      ),
      // 임계값 학습: 최근 THRESHOLD_LOOKBACK_DAYS 충전 시작 SoC 중앙값
      pool.query(
        `SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY start_battery_level)::float AS median_soc,
                COUNT(*)::int AS sample_count
         FROM charging_processes
         WHERE car_id = $1
           AND start_battery_level IS NOT NULL
           AND end_date >= NOW() - ($2 || ' days')::interval`,
        [carId, THRESHOLD_LOOKBACK_DAYS]
      ),
    ]);

    const pos = posResult.rows[0];
    const currentState = stateResult.rows[0]?.state || 'unknown';
    const currentBattery = pos?.battery_level ?? null;

    // ── 추천 충전일 계산 ──
    let estimatedCharge = null;

    if (currentBattery != null && currentState !== 'charging') {
      const socAtFullPast = socPastFullResult.rows[0]?.battery_level ?? null;
      const socAtRecentPast = socPastRecentResult.rows[0]?.battery_level ?? null;
      const chargesRecent = chargesRecentResult.rows[0]?.soc_added ?? 0;
      const chargesOlder = chargesFullResult.rows[0]?.soc_added ?? 0;

      // 기간별 총 소모량 = 과거 SoC − 기준 SoC + 그 사이 충전량
      // 최근 구간: socAtRecentPast → currentBattery
      const recentConsumption = socAtRecentPast != null
        ? (socAtRecentPast - currentBattery) + chargesRecent
        : null;
      // 이전 구간: socAtFullPast → socAtRecentPast
      const olderConsumption = (socAtFullPast != null && socAtRecentPast != null)
        ? (socAtFullPast - socAtRecentPast) + chargesOlder
        : null;

      const olderDays = LOOKBACK_DAYS - RECENT_DAYS;
      const recentDaily = recentConsumption != null && recentConsumption > 0
        ? recentConsumption / RECENT_DAYS
        : null;
      const olderDaily = olderConsumption != null && olderConsumption > 0
        ? olderConsumption / olderDays
        : null;

      // D안: EMA 스타일 가중 평균 (양쪽 다 있으면 가중, 한쪽만 있으면 그대로)
      let weightedDaily = null;
      if (recentDaily != null && olderDaily != null) {
        weightedDaily = (recentDaily * RECENT_WEIGHT + olderDaily * OLDER_WEIGHT) / (RECENT_WEIGHT + OLDER_WEIGHT);
      } else if (recentDaily != null) {
        weightedDaily = recentDaily;
      } else if (olderDaily != null) {
        weightedDaily = olderDaily;
      }

      // C안: 임계값 학습
      const learnedMedian = thresholdResult.rows[0]?.median_soc;
      const sampleCount = thresholdResult.rows[0]?.sample_count ?? 0;
      let thresholdPct = DEFAULT_THRESHOLD_PCT;
      let thresholdSource = 'default';
      if (sampleCount >= MIN_CHARGES_FOR_LEARNING && learnedMedian != null) {
        thresholdPct = Math.max(THRESHOLD_MIN_PCT, Math.min(THRESHOLD_MAX_PCT, Math.round(learnedMedian)));
        thresholdSource = 'learned';
      }

      if (weightedDaily != null && weightedDaily > 0) {
        const remainingPct = currentBattery - thresholdPct;
        const daysRaw = remainingPct > 0 ? remainingPct / weightedDaily : 0;
        const daysUntil = Math.max(0, Math.round(daysRaw));
        const target = new Date();
        target.setDate(target.getDate() + daysUntil);

        estimatedCharge = {
          date: target.toISOString(),
          days_until: daysUntil,
          threshold_pct: thresholdPct,
          threshold_source: thresholdSource,
          daily_consumption_pct: parseFloat(weightedDaily.toFixed(2)),
        };
      }
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
      estimated_charge: estimatedCharge,
    });
  } catch (err) {
    console.error('/api/car error:', err);
    return Response.json({ error: 'DB error' }, { status: 500 });
  }
}
