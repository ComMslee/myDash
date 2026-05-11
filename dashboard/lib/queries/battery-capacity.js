// 배터리 용량 추정 + 사이클 계산 모듈
// — 충전 역산 / positions 역산 / 상수 3단계 블렌딩
import pool from '@/lib/db';
import { KWH_PER_KM, RATED_RANGE_MAX_KM } from '@/lib/constants';

/** 충전 세션 역산 (1순위) */
export function queryCapacityFromCharge(carId) {
  return pool.query(`
    SELECT AVG(est)::float AS capacity_kwh FROM (
      SELECT charge_energy_added / NULLIF(end_battery_level - start_battery_level, 0) * 100 AS est
      FROM charging_processes
      WHERE car_id = $1 AND charge_energy_added > 5
        AND start_battery_level IS NOT NULL AND end_battery_level IS NOT NULL
        AND end_battery_level > start_battery_level + 5
      ORDER BY (end_battery_level - start_battery_level) DESC
      LIMIT 20
    ) sub
  `, [carId]);
}

/** positions 기반 역산 (2순위) */
export function queryCapacityFromPositions(carId) {
  return pool.query(`
    SELECT AVG(rated_battery_range_km / battery_level * 100)::float AS full_rated_range_km
    FROM (
      SELECT rated_battery_range_km, battery_level
      FROM positions
      WHERE car_id = $1 AND rated_battery_range_km IS NOT NULL AND battery_level > 10
      ORDER BY date DESC LIMIT 50
    ) sub
  `, [carId]);
}

/** 누적 주행거리 */
export function queryOdometer(carId) {
  return pool.query(`
    SELECT odometer::float FROM positions
    WHERE car_id = $1 AND odometer IS NOT NULL
    ORDER BY date DESC LIMIT 1
  `, [carId]);
}

/** 누적 충전량(kWh) */
export function queryTotalKwh(carId) {
  return pool.query(`
    SELECT COALESCE(SUM(charge_energy_added), 0)::float AS total_kwh
    FROM charging_processes WHERE car_id = $1 AND charge_energy_added IS NOT NULL
  `, [carId]);
}

/** 누적 주행 방전량 (rated range km) */
export function queryTotalDriveDischargeKm(carId) {
  return pool.query(`
    SELECT COALESCE(SUM(GREATEST(start_rated_range_km - end_rated_range_km, 0)), 0)::float AS total_km
    FROM drives WHERE car_id = $1
      AND start_rated_range_km IS NOT NULL AND end_rated_range_km IS NOT NULL
  `, [carId]);
}

/** 첫 충전일 */
export function queryFirstCharge(carId) {
  return pool.query(`SELECT MIN(start_date) AS first_date FROM charging_processes WHERE car_id = $1`, [carId]);
}

/** 첫 주행일 */
export function queryFirstDrive(carId) {
  return pool.query(`SELECT MIN(start_date) AS first_date FROM drives WHERE car_id = $1`, [carId]);
}

/** 이번주 충전량 */
export function queryThisWeekCharge(carId, weekStartUTCISO) {
  return pool.query(`
    SELECT COALESCE(SUM(charge_energy_added), 0)::float AS kwh
    FROM charging_processes WHERE car_id = $1 AND start_date >= $2
      AND charge_energy_added IS NOT NULL
  `, [carId, weekStartUTCISO]);
}

/** 이번주 방전량(km) */
export function queryThisWeekDischarge(carId, weekStartUTCISO) {
  return pool.query(`
    SELECT COALESCE(SUM(GREATEST(start_rated_range_km - end_rated_range_km, 0)), 0)::float AS total_km
    FROM drives WHERE car_id = $1 AND start_date >= $2
      AND start_rated_range_km IS NOT NULL AND end_rated_range_km IS NOT NULL
  `, [carId, weekStartUTCISO]);
}

/** 이번달 충전량 */
export function queryThisMonthCharge(carId, monthStartUTCISO) {
  return pool.query(`
    SELECT COALESCE(SUM(charge_energy_added), 0)::float AS kwh
    FROM charging_processes WHERE car_id = $1 AND start_date >= $2
      AND charge_energy_added IS NOT NULL
  `, [carId, monthStartUTCISO]);
}

/** 이번달 방전량(km) */
export function queryThisMonthDischarge(carId, monthStartUTCISO) {
  return pool.query(`
    SELECT COALESCE(SUM(GREATEST(start_rated_range_km - end_rated_range_km, 0)), 0)::float AS total_km
    FROM drives WHERE car_id = $1 AND start_date >= $2
      AND start_rated_range_km IS NOT NULL AND end_rated_range_km IS NOT NULL
  `, [carId, monthStartUTCISO]);
}

/** 12주 주별 충전 패턴 */
export function queryWeeklyCharge(carId, twelveWeeksAgoUTCISO) {
  return pool.query(`
    SELECT
      EXTRACT(EPOCH FROM DATE_TRUNC('week', start_date + INTERVAL '9 hours') - INTERVAL '9 hours')::bigint AS week_epoch,
      COALESCE(SUM(
        CASE WHEN end_battery_level IS NOT NULL AND start_battery_level IS NOT NULL
             THEN GREATEST(end_battery_level - start_battery_level, 0) ELSE 0 END
      ), 0)::int AS charge_pct,
      COALESCE(SUM(charge_energy_added), 0)::float AS charge_kwh
    FROM charging_processes
    WHERE car_id = $1 AND start_date >= $2 AND charge_energy_added IS NOT NULL
    GROUP BY week_epoch ORDER BY week_epoch DESC
  `, [carId, twelveWeeksAgoUTCISO]);
}

/** 12주 주별 소비 패턴 */
export function queryWeeklyDrive(carId, twelveWeeksAgoUTCISO) {
  return pool.query(`
    SELECT
      EXTRACT(EPOCH FROM DATE_TRUNC('week', start_date + INTERVAL '9 hours') - INTERVAL '9 hours')::bigint AS week_epoch,
      COALESCE(SUM(
        CASE WHEN start_rated_range_km IS NOT NULL AND end_rated_range_km IS NOT NULL
             THEN GREATEST(start_rated_range_km - end_rated_range_km, 0) ELSE 0 END
      ), 0)::float AS range_used_km
    FROM drives
    WHERE car_id = $1 AND start_date >= $2
    GROUP BY week_epoch ORDER BY week_epoch DESC
  `, [carId, twelveWeeksAgoUTCISO]);
}

/**
 * 용량 블렌딩 결정:
 *  1) 충전 역산 → 2) positions 역산 → 3) RATED_RANGE_MAX_KM 상수
 */
export function computeBatteryCapacity(capFromChargeRow, capFromPositionsRow) {
  const capFromCharge = capFromChargeRow?.capacity_kwh;
  const fullRatedRangeKm = capFromPositionsRow?.full_rated_range_km;
  const capFromPositions = fullRatedRangeKm ? fullRatedRangeKm * KWH_PER_KM : null;
  return capFromCharge
    ? parseFloat(parseFloat(capFromCharge).toFixed(1))
    : capFromPositions
      ? parseFloat(parseFloat(capFromPositions).toFixed(1))
      : parseFloat((RATED_RANGE_MAX_KM * KWH_PER_KM).toFixed(1));
}

/**
 * 전체 사이클 블렌딩 계산.
 * — odometerKwh(주행거리 추정) ↔ totalKwh(실측 충전) 블렌딩
 * — α = totalKwh / odometerKwh (0~1)
 */
export function computeCycles({ batteryCapacity, totalKwh, odometer, firstDate, now }) {
  const odometerKwh = odometer * KWH_PER_KM;

  let totalKwhEffective;
  if (odometerKwh <= 0) {
    totalKwhEffective = totalKwh;
  } else if (totalKwh <= 0) {
    totalKwhEffective = odometerKwh;
  } else {
    const alpha = Math.min(totalKwh / odometerKwh, 1);
    totalKwhEffective = alpha * totalKwh + (1 - alpha) * odometerKwh;
  }

  const totalCycles = batteryCapacity > 0 ? parseFloat((totalKwhEffective / batteryCapacity).toFixed(1)) : 0;
  const isEstimated = totalKwh <= 0 || (odometerKwh > 0 && totalKwh / odometerKwh < 0.9);

  // 월평균: 블렌딩 비율에 따라 개월수도 블렌딩
  const monthsFromOdo = odometer > 0 ? Math.max(1, odometer / 1500) : 12;
  const monthsFromRecord = firstDate ? Math.max(1, (now - firstDate) / (30.4375 * 86400000)) : null;
  const chargeRatio = odometerKwh > 0 ? Math.min(totalKwh / odometerKwh, 1) : 0;
  const monthsElapsed = monthsFromRecord
    ? chargeRatio * monthsFromRecord + (1 - chargeRatio) * monthsFromOdo
    : monthsFromOdo;
  const avgMonthlyCycles = parseFloat((totalCycles / monthsElapsed).toFixed(2));

  return { totalCycles, isEstimated, avgMonthlyCycles };
}
