// 배터리 건강 점수 + SOC 분포 + 히스토그램 + 구간 분류
import pool from '@/lib/db';

/** 충전 시작×종료 2D 히트맵 (5% 단위, 20x20) */
export function queryChargeMatrix(carId) {
  return pool.query(`
    SELECT
      LEAST(FLOOR(start_battery_level / 5)::int, 19) AS start_bucket,
      LEAST(FLOOR(end_battery_level / 5)::int, 19) AS end_bucket,
      COUNT(*)::int AS cnt
    FROM charging_processes
    WHERE car_id = $1
      AND start_battery_level IS NOT NULL
      AND end_battery_level IS NOT NULL
      AND end_battery_level > start_battery_level
    GROUP BY start_bucket, end_bucket
  `, [carId]);
}

/** 충전 시작 레벨 히스토그램 (50x 2% 단위) */
export function queryHistStart(carId) {
  return pool.query(`
    SELECT LEAST(FLOOR(start_battery_level / 2)::int, 49) AS bucket, COUNT(*)::int AS cnt
    FROM charging_processes
    WHERE car_id = $1 AND start_battery_level IS NOT NULL
    GROUP BY bucket ORDER BY bucket
  `, [carId]);
}

/** 충전 종료 레벨 히스토그램 (50x 2% 단위) */
export function queryHistEnd(carId) {
  return pool.query(`
    SELECT LEAST(FLOOR(end_battery_level / 2)::int, 49) AS bucket, COUNT(*)::int AS cnt
    FROM charging_processes
    WHERE car_id = $1 AND end_battery_level IS NOT NULL
    GROUP BY bucket ORDER BY bucket
  `, [carId]);
}

/** SOC 체류 분포 (positions 1% 단위) */
export function querySocDist(carId) {
  return pool.query(`
    SELECT battery_level AS soc, COUNT(*)::int AS cnt
    FROM positions
    WHERE car_id = $1 AND battery_level IS NOT NULL
    GROUP BY battery_level ORDER BY battery_level
  `, [carId]);
}

/** 50빈 히스토그램 구성 */
export function buildHist(rows) {
  return Array.from({ length: 50 }, (_, i) => {
    const row = rows.find(r => r.bucket === i);
    return row?.cnt || 0;
  });
}

/**
 * SOC 분포 → 건강 점수/등급/구간 비율/팁 계산.
 * isLFP에 따라 최적 중심/범위가 달라진다.
 */
export function computeHealth(socRows, { isLFP = true } = {}) {
  const OPTIMAL_CENTER = isLFP ? 60 : 50;
  const RANGE_LOW = 20;
  const RANGE_HIGH = isLFP ? 100 : 80;

  const totalReadings = socRows.reduce((s, r) => s + r.cnt, 0);
  let healthScore = 0;
  let avgSoc = 0;
  const zoneCounts = { ideal: 0, good: 0, caution: 0, stress: 0 };
  const socHist = Array.from({ length: 10 }, () => 0);
  const socHist2 = Array.from({ length: 50 }, () => 0);

  if (totalReadings > 0) {
    let weightedSoc = 0;
    let weightedScore = 0;
    for (const { soc, cnt } of socRows) {
      const level = parseInt(soc);
      weightedSoc += level * cnt;
      let pointScore;
      if (level >= RANGE_LOW && level <= RANGE_HIGH) {
        const halfRange = (RANGE_HIGH - RANGE_LOW) / 2;
        const distFromCenter = Math.abs(level - OPTIMAL_CENTER) / halfRange;
        pointScore = 100 - distFromCenter * 30;
      } else {
        const overLow = level < RANGE_LOW ? (RANGE_LOW - level) / RANGE_LOW : 0;
        const denomHigh = 100 - RANGE_HIGH;
        const overHigh = level > RANGE_HIGH && denomHigh > 0 ? (level - RANGE_HIGH) / denomHigh : 0;
        const over = Math.max(overLow, overHigh);
        pointScore = Math.max(0, 60 - over * 100);
      }
      weightedScore += pointScore * cnt;
      if (level >= RANGE_LOW && level <= RANGE_HIGH) {
        const distPct = Math.abs(level - OPTIMAL_CENTER) / ((RANGE_HIGH - RANGE_LOW) / 2);
        if (distPct <= 0.4) zoneCounts.ideal += cnt;
        else zoneCounts.good += cnt;
      } else if (level >= 10 && level < RANGE_LOW || level > RANGE_HIGH && level <= 90) {
        zoneCounts.caution += cnt;
      } else {
        zoneCounts.stress += cnt;
      }
      const bucket = Math.min(Math.floor(level / 10), 9);
      socHist[bucket] += cnt;
      const bucket2 = Math.min(Math.floor(level / 2), 49);
      socHist2[bucket2] += cnt;
    }
    avgSoc = parseFloat((weightedSoc / totalReadings).toFixed(1));
    healthScore = Math.round(weightedScore / totalReadings);
  }

  const grade = healthScore >= 90 ? 'A+' : healthScore >= 80 ? 'A'
    : healthScore >= 70 ? 'B+' : healthScore >= 60 ? 'B'
    : healthScore >= 50 ? 'C+' : healthScore >= 40 ? 'C'
    : healthScore >= 30 ? 'D' : 'F';

  // 팁 (LFP 맞춤)
  const tips = [];
  if (isLFP) {
    if (avgSoc < 50) tips.push('LFP는 100% 충전 권장, SOC를 높이세요');
    if (avgSoc >= 50 && avgSoc <= 80) tips.push('주기적 100% 충전으로 BMS 캘리브레이션');
    if (avgSoc > 80) tips.push('이상적인 관리! 20% 이하 방전만 주의');
    if (avgSoc < 20) tips.push('20% 이하 방전은 셀 스트레스 증가');
  } else {
    if (avgSoc > 80) tips.push('충전 상한 80%로 수명 향상');
    if (avgSoc < 20) tips.push('20% 이하 방전은 셀 스트레스 증가');
    if (tips.length === 0) tips.push('20~80% 범위 유지 권장');
  }
  if (zoneCounts.ideal > totalReadings * 0.5 && tips.length === 0) tips.push('이상적인 배터리 관리 중!');
  if (tips.length === 0) tips.push(`${RANGE_LOW}~${RANGE_HIGH}% 범위 유지 권장`);

  return {
    healthScore,
    grade,
    avgSoc,
    OPTIMAL_CENTER,
    RANGE_LOW,
    RANGE_HIGH,
    isLFP,
    totalReadings,
    socHist,
    socHist2,
    zoneCounts,
    tips,
  };
}
