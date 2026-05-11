// 일간 최다/최소 충전·소비 레코드 — 파라미터화된 단일 헬퍼로 12개 쿼리를 통합
import pool from '@/lib/db';

/**
 * 일간 레코드 단일 쿼리.
 * @param {number} carId
 * @param {object} opts
 *   - type: 'charge' | 'drive'
 *   - order: 'max' | 'min'   (max=DESC, min=ASC + HAVING 필터)
 *   - sinceDate: Date | null (null이면 전체 기간)
 */
export function queryDailyRecord(carId, { type, order, sinceDate }) {
  const params = [carId];
  const sinceClause = sinceDate ? (params.push(sinceDate), ` AND start_date >= $${params.length}`) : '';
  const orderDir = order === 'max' ? 'DESC' : 'ASC';

  if (type === 'charge') {
    // min 쿼리는 '1kWh 이상 충전한 날' 필터 필요
    const havingClause = order === 'min' ? 'HAVING SUM(charge_energy_added) >= 1' : '';
    return pool.query(`
      SELECT DATE(start_date + INTERVAL '9 hours')::text AS day,
             SUM(CASE WHEN end_battery_level IS NOT NULL AND start_battery_level IS NOT NULL
                      THEN GREATEST(end_battery_level - start_battery_level, 0) ELSE 0 END)::int AS charge_pct,
             SUM(charge_energy_added)::float AS kwh
      FROM charging_processes
      WHERE car_id = $1 AND charge_energy_added IS NOT NULL${sinceClause}
      GROUP BY day ${havingClause}
      ORDER BY kwh ${orderDir} LIMIT 1
    `, params);
  }

  // type === 'drive'
  // min 쿼리는 '주행이 있었던 날' 필터 필요
  const havingClause = order === 'min' ? 'HAVING SUM(distance) > 0' : '';
  return pool.query(`
    SELECT DATE(start_date + INTERVAL '9 hours')::text AS day,
           SUM(CASE WHEN start_rated_range_km IS NOT NULL AND end_rated_range_km IS NOT NULL
                    THEN GREATEST(start_rated_range_km - end_rated_range_km, 0) ELSE 0 END)::float AS range_used_km
    FROM drives WHERE car_id = $1${sinceClause}
    GROUP BY day ${havingClause}
    ORDER BY range_used_km ${orderDir} LIMIT 1
  `, params);
}

/** 3개 기간(all/1m/6m) × 4개 카테고리(maxCharge/minCharge/maxDrive/minDrive) = 12개 쿼리 일괄 실행 */
export function queryAllDailyRecords(carId, { oneMonthAgo, sixMonthsAgo }) {
  const specs = [];
  for (const [periodName, sinceDate] of [['all', null], ['month', oneMonthAgo], ['six_month', sixMonthsAgo]]) {
    for (const [cat, type, order] of [
      ['max_charge', 'charge', 'max'],
      ['min_charge', 'charge', 'min'],
      ['max_consume', 'drive', 'max'],
      ['min_consume', 'drive', 'min'],
    ]) {
      specs.push({ periodName, cat, type, order, sinceDate });
    }
  }
  return Promise.all(specs.map(s => queryDailyRecord(carId, s))).then(results => {
    const out = { all: {}, month: {}, six_month: {} };
    specs.forEach((s, i) => {
      out[s.periodName][s.cat] = results[i].rows[0] || null;
    });
    return out;
  });
}
