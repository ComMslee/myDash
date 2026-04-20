import pool from '@/lib/db';
import { toKstDate } from '@/lib/kst';

export const dynamic = 'force-dynamic';

// ── 추천 충전일 계산 파라미터 ─────────────────────────────
// drives 기반 일별 소모 + 진짜 EMA(α=0.3) + 임계값 학습 + 신뢰도
const LOOKBACK_DAYS = 14;              // drives 관측 기간
const EMA_ALPHA = 0.3;                 // 지수이동평균 평활 계수 (최신 비중)
const VAMPIRE_BASELINE_PCT = 1.0;      // 주차 대기 소모 기본값 %/일
const MIN_EFFECTIVE_DAILY = 0.5;       // 하한 — 0이면 예측 불능 방지
const THRESHOLD_LOOKBACK_DAYS = 90;    // 임계값 학습 기간
const MIN_CHARGES_FOR_LEARNING = 5;    // 학습 최소 표본 수
const THRESHOLD_MIN_PCT = 15;          // 학습 임계값 하한(안전)
const THRESHOLD_MAX_PCT = 50;          // 학습 임계값 상한
const DEFAULT_THRESHOLD_PCT = 20;      // 학습 실패 시 기본값
const CONFIDENCE_HIGH_DAYS = 7;        // 운행일 ≥ 이 수 = high
const CONFIDENCE_MID_DAYS = 3;         // 운행일 ≥ 이 수 = medium, 미만 = low

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
      dailyDrivesResult,
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
      // 일별 drives 소모량 (rated_range_km → % 환산, 350km 기준)
      pool.query(
        `SELECT DATE(start_date + INTERVAL '9 hours')::text AS day,
                (SUM(CASE
                  WHEN start_rated_range_km IS NOT NULL AND end_rated_range_km IS NOT NULL
                  THEN GREATEST(start_rated_range_km - end_rated_range_km, 0)
                  ELSE 0
                END) / 350.0 * 100)::float AS pct_consumed
         FROM drives
         WHERE car_id = $1
           AND start_date >= NOW() - INTERVAL '14 days'
         GROUP BY day
         ORDER BY day ASC`,
        [carId]
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
      // 임계값 학습 (PERCENTILE_CONT 기반 — 기존 유지)
      const learnedMedian = thresholdResult.rows[0]?.median_soc;
      const sampleCount = thresholdResult.rows[0]?.sample_count ?? 0;
      let thresholdPct = DEFAULT_THRESHOLD_PCT;
      let thresholdSource = 'default';
      if (sampleCount >= MIN_CHARGES_FOR_LEARNING && learnedMedian != null) {
        thresholdPct = Math.max(THRESHOLD_MIN_PCT, Math.min(THRESHOLD_MAX_PCT, Math.round(learnedMedian)));
        thresholdSource = 'learned';
      }

      // drives 기반 일별 소모량 → LOOKBACK_DAYS 타임라인 채움 + 진짜 EMA
      const pctByDay = new Map(dailyDrivesResult.rows.map(r => [r.day, parseFloat(r.pct_consumed) || 0]));
      const drivingDayCount = Array.from(pctByDay.values()).filter(v => v > 0).length;

      // 오늘(KST)부터 LOOKBACK_DAYS 이전까지 일별 시리즈 구성 (누락일=0)
      const todayKst = toKstDate(Date.now());
      const series = [];
      for (let i = LOOKBACK_DAYS - 1; i >= 0; i--) {
        const d = new Date(todayKst);
        d.setUTCDate(d.getUTCDate() - i);
        const key = d.toISOString().slice(0, 10);
        series.push(pctByDay.get(key) ?? 0);
      }

      // 지수이동평균 (α=0.3, 오래된→최신 순)
      let ema = null;
      for (const pct of series) {
        ema = ema === null ? pct : EMA_ALPHA * pct + (1 - EMA_ALPHA) * ema;
      }
      const drivingDaily = ema ?? 0;

      // 주차 중 자연 감소 베이스라인 포함
      const effectiveDaily = Math.max(MIN_EFFECTIVE_DAILY, drivingDaily + VAMPIRE_BASELINE_PCT);

      // 신뢰도 — 운행일이 충분한가
      const confidence =
        drivingDayCount >= CONFIDENCE_HIGH_DAYS ? 'high'
        : drivingDayCount >= CONFIDENCE_MID_DAYS ? 'medium'
        : 'low';

      if (currentBattery > thresholdPct) {
        const remainingPct = currentBattery - thresholdPct;
        const daysUntil = Math.max(0, Math.round(remainingPct / effectiveDaily));
        const target = new Date();
        target.setDate(target.getDate() + daysUntil);

        estimatedCharge = {
          date: target.toISOString(),
          days_until: daysUntil,
          threshold_pct: thresholdPct,
          threshold_source: thresholdSource,
          daily_consumption_pct: parseFloat(effectiveDaily.toFixed(2)),
          driving_daily_pct: parseFloat(drivingDaily.toFixed(2)),
          driving_day_count: drivingDayCount,
          confidence,
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
