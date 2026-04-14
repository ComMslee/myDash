import pool from '@/lib/db';
import { KWH_PER_KM, RATED_RANGE_MAX_KM } from '@/lib/constants';

export const dynamic = 'force-dynamic';

function getISOWeekNumber(mondayUTC) {
  // mondayUTC: Date object at Monday midnight KST expressed as UTC
  // Thursday of this week = Monday + 3 days
  const thu = new Date(mondayUTC.getTime() + 3 * 86400000);
  const year = thu.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week1Mon = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000);
  return { week: Math.round((mondayUTC.getTime() - week1Mon.getTime()) / (7 * 86400000)) + 1, year };
}

export async function GET() {
  try {
    const carResult = await pool.query(`SELECT id FROM cars LIMIT 1`);
    if (carResult.rows.length === 0) return Response.json({ error: 'No car found' }, { status: 404 });
    const carId = carResult.rows[0].id;

    const KST = 9 * 60 * 60 * 1000;
    const now = new Date();
    const nowKST = new Date(now.getTime() + KST);
    const dowKST = nowKST.getUTCDay(); // 0=Sun
    const daysSinceMon = (dowKST + 6) % 7;

    // Current week Monday midnight KST → UTC
    const curWeekMonUTC = new Date(
      Date.UTC(nowKST.getUTCFullYear(), nowKST.getUTCMonth(), nowKST.getUTCDate() - daysSinceMon) - KST
    );
    const twelveWeeksAgoUTC = new Date(curWeekMonUTC.getTime() - 11 * 7 * 86400000);

    // KST 기준 이번달 시작 (UTC)
    const thisMonthStartUTC = new Date(Date.UTC(nowKST.getUTCFullYear(), nowKST.getUTCMonth(), 1) - KST);

    const [
      capacityFromChargeResult,
      capacityFromPositionsResult,
      odometerResult,
      totalKwhResult,
      totalDriveDischargeResult,
      firstChargeResult,
      firstDriveResult,
      thisWeekChargeResult,
      thisWeekDischargeResult,
      thisMonthChargeResult,
      thisMonthDischargeResult,
      weeklyChargeResult,
      weeklyDriveResult,
      dailyMaxChargeResult,
      dailyMinChargeResult,
      dailyMaxDriveResult,
      dailyMinDriveResult,
      histStartResult,
      histEndResult,
      socDistResult,
    ] = await Promise.all([
      // 배터리 용량 추정 1순위: 충전 세션 역산
      pool.query(`
        SELECT AVG(est)::float AS capacity_kwh FROM (
          SELECT charge_energy_added / NULLIF(end_battery_level - start_battery_level, 0) * 100 AS est
          FROM charging_processes
          WHERE car_id = $1 AND charge_energy_added > 5
            AND start_battery_level IS NOT NULL AND end_battery_level IS NOT NULL
            AND end_battery_level > start_battery_level + 5
          ORDER BY (end_battery_level - start_battery_level) DESC
          LIMIT 20
        ) sub
      `, [carId]),

      // 배터리 용량 추정 2순위: positions rated_range / battery_level 역산
      pool.query(`
        SELECT AVG(rated_battery_range_km / battery_level * 100)::float AS full_rated_range_km
        FROM (
          SELECT rated_battery_range_km, battery_level
          FROM positions
          WHERE car_id = $1 AND rated_battery_range_km IS NOT NULL AND battery_level > 10
          ORDER BY date DESC LIMIT 50
        ) sub
      `, [carId]),

      // 누적 주행거리 (odometer)
      pool.query(`
        SELECT odometer::float FROM positions
        WHERE car_id = $1 AND odometer IS NOT NULL
        ORDER BY date DESC LIMIT 1
      `, [carId]),

      // 누적 충전량
      pool.query(`
        SELECT COALESCE(SUM(charge_energy_added), 0)::float AS total_kwh
        FROM charging_processes WHERE car_id = $1 AND charge_energy_added IS NOT NULL
      `, [carId]),

      // 누적 주행 방전량 (rated range km 기준)
      pool.query(`
        SELECT COALESCE(SUM(GREATEST(start_rated_range_km - end_rated_range_km, 0)), 0)::float AS total_km
        FROM drives WHERE car_id = $1
          AND start_rated_range_km IS NOT NULL AND end_rated_range_km IS NOT NULL
      `, [carId]),

      // 첫 충전일 (월평균 계산용)
      pool.query(`
        SELECT MIN(start_date) AS first_date FROM charging_processes WHERE car_id = $1
      `, [carId]),

      // 첫 주행일 (충전 데이터 없을 때 fallback)
      pool.query(`
        SELECT MIN(start_date) AS first_date FROM drives WHERE car_id = $1
      `, [carId]),

      // 이번주 충전량
      pool.query(`
        SELECT COALESCE(SUM(charge_energy_added), 0)::float AS kwh
        FROM charging_processes WHERE car_id = $1 AND start_date >= $2
          AND charge_energy_added IS NOT NULL
      `, [carId, curWeekMonUTC.toISOString()]),

      // 이번주 방전량 (rated range km 기준)
      pool.query(`
        SELECT COALESCE(SUM(GREATEST(start_rated_range_km - end_rated_range_km, 0)), 0)::float AS total_km
        FROM drives WHERE car_id = $1 AND start_date >= $2
          AND start_rated_range_km IS NOT NULL AND end_rated_range_km IS NOT NULL
      `, [carId, curWeekMonUTC.toISOString()]),

      // 이번달 충전량
      pool.query(`
        SELECT COALESCE(SUM(charge_energy_added), 0)::float AS kwh
        FROM charging_processes WHERE car_id = $1 AND start_date >= $2
          AND charge_energy_added IS NOT NULL
      `, [carId, thisMonthStartUTC.toISOString()]),

      // 이번달 방전량 (rated range km 기준)
      pool.query(`
        SELECT COALESCE(SUM(GREATEST(start_rated_range_km - end_rated_range_km, 0)), 0)::float AS total_km
        FROM drives WHERE car_id = $1 AND start_date >= $2
          AND start_rated_range_km IS NOT NULL AND end_rated_range_km IS NOT NULL
      `, [carId, thisMonthStartUTC.toISOString()]),

      // 주별 충전 패턴 (12주)
      pool.query(`
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
      `, [carId, twelveWeeksAgoUTC.toISOString()]),

      // 주별 소비 패턴 (12주)
      pool.query(`
        SELECT
          EXTRACT(EPOCH FROM DATE_TRUNC('week', start_date + INTERVAL '9 hours') - INTERVAL '9 hours')::bigint AS week_epoch,
          COALESCE(SUM(
            CASE WHEN start_rated_range_km IS NOT NULL AND end_rated_range_km IS NOT NULL
                 THEN GREATEST(start_rated_range_km - end_rated_range_km, 0) ELSE 0 END
          ), 0)::float AS range_used_km
        FROM drives
        WHERE car_id = $1 AND start_date >= $2
        GROUP BY week_epoch ORDER BY week_epoch DESC
      `, [carId, twelveWeeksAgoUTC.toISOString()]),

      // 일간 최다 충전
      pool.query(`
        SELECT DATE(start_date + INTERVAL '9 hours')::text AS day,
               SUM(CASE WHEN end_battery_level IS NOT NULL AND start_battery_level IS NOT NULL
                        THEN GREATEST(end_battery_level - start_battery_level, 0) ELSE 0 END)::int AS charge_pct,
               SUM(charge_energy_added)::float AS kwh
        FROM charging_processes
        WHERE car_id = $1 AND charge_energy_added IS NOT NULL
        GROUP BY day ORDER BY kwh DESC LIMIT 1
      `, [carId]),

      // 일간 최소 충전 (1kWh 이상 충전한 날)
      pool.query(`
        SELECT DATE(start_date + INTERVAL '9 hours')::text AS day,
               SUM(CASE WHEN end_battery_level IS NOT NULL AND start_battery_level IS NOT NULL
                        THEN GREATEST(end_battery_level - start_battery_level, 0) ELSE 0 END)::int AS charge_pct,
               SUM(charge_energy_added)::float AS kwh
        FROM charging_processes
        WHERE car_id = $1 AND charge_energy_added IS NOT NULL
        GROUP BY day HAVING SUM(charge_energy_added) >= 1
        ORDER BY kwh ASC LIMIT 1
      `, [carId]),

      // 일간 최다 소비 (주행거리 기준)
      pool.query(`
        SELECT DATE(start_date + INTERVAL '9 hours')::text AS day,
               SUM(CASE WHEN start_rated_range_km IS NOT NULL AND end_rated_range_km IS NOT NULL
                        THEN GREATEST(start_rated_range_km - end_rated_range_km, 0) ELSE 0 END)::float AS range_used_km
        FROM drives WHERE car_id = $1
        GROUP BY day ORDER BY range_used_km DESC LIMIT 1
      `, [carId]),

      // 일간 최소 소비 (주행이 있었던 날 중)
      pool.query(`
        SELECT DATE(start_date + INTERVAL '9 hours')::text AS day,
               SUM(CASE WHEN start_rated_range_km IS NOT NULL AND end_rated_range_km IS NOT NULL
                        THEN GREATEST(start_rated_range_km - end_rated_range_km, 0) ELSE 0 END)::float AS range_used_km
        FROM drives WHERE car_id = $1
        GROUP BY day HAVING SUM(distance) > 0
        ORDER BY range_used_km ASC LIMIT 1
      `, [carId]),

      // 충전 시작 레벨 히스토그램 (10개 구간)
      pool.query(`
        SELECT LEAST(FLOOR(start_battery_level / 10)::int, 9) AS bucket, COUNT(*)::int AS cnt
        FROM charging_processes
        WHERE car_id = $1 AND start_battery_level IS NOT NULL
        GROUP BY bucket ORDER BY bucket
      `, [carId]),

      // 충전 종료 레벨 히스토그램 (10개 구간)
      pool.query(`
        SELECT LEAST(FLOOR(end_battery_level / 10)::int, 9) AS bucket, COUNT(*)::int AS cnt
        FROM charging_processes
        WHERE car_id = $1 AND end_battery_level IS NOT NULL
        GROUP BY bucket ORDER BY bucket
      `, [carId]),

      // SOC 체류 분포 (positions 기반, 1% 단위)
      pool.query(`
        SELECT battery_level AS soc, COUNT(*)::int AS cnt
        FROM positions
        WHERE car_id = $1 AND battery_level IS NOT NULL
        GROUP BY battery_level ORDER BY battery_level
      `, [carId]),
    ]);

    // 배터리 용량: 1순위 충전역산, 2순위 positions역산, 3순위 상수
    const capFromCharge = capacityFromChargeResult.rows[0]?.capacity_kwh;
    const fullRatedRangeKm = capacityFromPositionsResult.rows[0]?.full_rated_range_km;
    const capFromPositions = fullRatedRangeKm ? fullRatedRangeKm * KWH_PER_KM : null;
    const batteryCapacity = capFromCharge
      ? parseFloat(parseFloat(capFromCharge).toFixed(1))
      : capFromPositions
        ? parseFloat(parseFloat(capFromPositions).toFixed(1))
        : parseFloat((RATED_RANGE_MAX_KM * KWH_PER_KM).toFixed(1));

    // 누적 주행거리 (odometer)
    const odometer = odometerResult.rows[0]?.odometer || 0;

    // ── 사이클 계산 (블렌딩 모델) ──
    // odometerKwh = 전체 주행거리 기반 추정 (설치 이전 포함)
    // totalKwh    = TeslaMate가 실제 기록한 충전량
    // 충전 데이터가 쌓일수록 실측 비중↑, 추정 비중↓ → 점진적 보정
    const totalKwh = parseFloat(totalKwhResult.rows[0].total_kwh);
    const odometerKwh = odometer * KWH_PER_KM;

    let totalKwhEffective;
    if (odometerKwh <= 0) {
      // odometer 없음 → 충전 데이터만 사용
      totalKwhEffective = totalKwh;
    } else if (totalKwh <= 0) {
      // 충전 기록 없음 → odometer 추정만 사용
      totalKwhEffective = odometerKwh;
    } else {
      // 블렌딩: 충전 비중(α) = 충전kWh / odometer추정kWh (0~1)
      // α가 1에 가까울수록 TeslaMate가 거의 전체 기간 커버 → 실측 신뢰
      // α가 0에 가까우면 아직 데이터 부족 → odometer 추정 신뢰
      const alpha = Math.min(totalKwh / odometerKwh, 1);
      totalKwhEffective = alpha * totalKwh + (1 - alpha) * odometerKwh;
    }

    const totalCycles = batteryCapacity > 0 ? parseFloat((totalKwhEffective / batteryCapacity).toFixed(1)) : 0;
    const isEstimated = totalKwh <= 0 || (odometerKwh > 0 && totalKwh / odometerKwh < 0.9);

    // 월평균: odometer 기반이면 월 평균주행거리로 개월수 추정, 실측이면 기록 기간 기준
    const firstChargeDate = firstChargeResult.rows[0]?.first_date;
    const firstDriveDate = firstDriveResult.rows[0]?.first_date;
    const firstDate = firstChargeDate && firstDriveDate
      ? new Date(Math.min(new Date(firstChargeDate), new Date(firstDriveDate)))
      : firstChargeDate ? new Date(firstChargeDate)
      : firstDriveDate ? new Date(firstDriveDate)
      : null;
    // 블렌딩 비율에 따라 개월수도 블렌딩
    const monthsFromOdo = odometer > 0 ? Math.max(1, odometer / 1500) : 12;
    const monthsFromRecord = firstDate ? Math.max(1, (now - firstDate) / (30.4375 * 86400000)) : null;
    const chargeRatio = odometerKwh > 0 ? Math.min(totalKwh / odometerKwh, 1) : 0;
    const monthsElapsed = monthsFromRecord
      ? chargeRatio * monthsFromRecord + (1 - chargeRatio) * monthsFromOdo
      : monthsFromOdo;
    const avgMonthlyCycles = parseFloat((totalCycles / monthsElapsed).toFixed(2));

    // 이번주/이번달: 충전 기록 있으면 충전 기준, 없으면 방전 기준
    const thisWeekKwh = parseFloat(thisWeekChargeResult.rows[0].kwh);
    const thisWeekDischargeKm = parseFloat(thisWeekDischargeResult.rows[0].total_km);
    const thisWeekKwhEffective = thisWeekKwh > 0 ? thisWeekKwh : thisWeekDischargeKm * KWH_PER_KM;
    const thisWeekCycles = batteryCapacity > 0 ? parseFloat((thisWeekKwhEffective / batteryCapacity).toFixed(2)) : 0;

    const thisMonthKwh = parseFloat(thisMonthChargeResult.rows[0].kwh);
    const thisMonthDischargeKm = parseFloat(thisMonthDischargeResult.rows[0].total_km);
    const thisMonthKwhEffective = thisMonthKwh > 0 ? thisMonthKwh : thisMonthDischargeKm * KWH_PER_KM;
    const thisMonthCycles = batteryCapacity > 0 ? parseFloat((thisMonthKwhEffective / batteryCapacity).toFixed(2)) : 0;

    // 주별 데이터 구성 (최신→과거 순, 12주)
    const weekly = [];
    for (let i = 0; i < 12; i++) {
      const weekStartUTC = new Date(curWeekMonUTC.getTime() - i * 7 * 86400000);
      const epochSec = Math.round(weekStartUTC.getTime() / 1000);
      const isCurrent = i === 0;

      const chargeRow = weeklyChargeResult.rows.find(r => Number(r.week_epoch) === epochSec);
      const driveRow = weeklyDriveResult.rows.find(r => Number(r.week_epoch) === epochSec);

      const weekStartKST = new Date(weekStartUTC.getTime() + KST);
      const sunKST = new Date(weekStartKST.getTime() + 6 * 86400000);
      const dateRange = `${weekStartKST.getUTCMonth() + 1}/${weekStartKST.getUTCDate()}~${sunKST.getUTCMonth() + 1}/${sunKST.getUTCDate()}`;
      const { week: weekNum, year: weekYear } = getISOWeekNumber(weekStartUTC);

      const chargePct = chargeRow ? chargeRow.charge_pct : 0;
      const chargeKwh = chargeRow ? parseFloat(parseFloat(chargeRow.charge_kwh).toFixed(1)) : 0;
      const rangeUsedKm = driveRow ? parseFloat(driveRow.range_used_km) : 0;
      const consumePct = RATED_RANGE_MAX_KM > 0 ? Math.round(rangeUsedKm / RATED_RANGE_MAX_KM * 100) : 0;
      const consumeKwh = parseFloat((rangeUsedKm * KWH_PER_KM).toFixed(1));

      weekly.push({
        iso_week: weekNum,
        iso_year: weekYear,
        date_range: dateRange,
        is_current: isCurrent,
        charge_pct: chargePct,
        charge_kwh: chargeKwh,
        consume_pct: consumePct,
        consume_kwh: consumeKwh,
      });
    }

    // 일간 레코드
    const fmtCharge = (row) => row ? {
      date: row.day,
      charge_pct: row.charge_pct || 0,
      kwh: parseFloat(parseFloat(row.kwh).toFixed(1)),
    } : null;
    const fmtDrive = (row) => row ? {
      date: row.day,
      consume_pct: RATED_RANGE_MAX_KM > 0 ? Math.round(parseFloat(row.range_used_km) / RATED_RANGE_MAX_KM * 100) : 0,
      consume_kwh: parseFloat((parseFloat(row.range_used_km) * KWH_PER_KM).toFixed(1)),
    } : null;

    // 히스토그램
    const buildHist = (rows) => Array.from({ length: 10 }, (_, i) => {
      const row = rows.find(r => r.bucket === i);
      return row?.cnt || 0;
    });
    const histStart = buildHist(histStartResult.rows);
    const histEnd = buildHist(histEndResult.rows);

    // 주로 충전하는 구간 (최빈값 버킷)
    const startModal = histStart.indexOf(Math.max(...histStart));
    const endModal = histEnd.indexOf(Math.max(...histEnd));

    // ── 배터리 헬스 점수 (배터리 화학 기반) ──
    // LFP: 이상 범위 20-100%, 최적 중심 60% (Tesla 공식 100% 충전 권장)
    // NCA/NMC: 이상 범위 20-80%, 최적 중심 50%
    // 판별: Model Y SR (상하이 생산, trim_badging=50) = LFP
    const isLFP = true; // Model Y RWD/SR = LFP (향후 DB 기반 자동 판별 가능)
    const OPTIMAL_CENTER = isLFP ? 60 : 50;
    const RANGE_LOW = 20;
    const RANGE_HIGH = isLFP ? 100 : 80;

    const socRows = socDistResult.rows;
    const totalReadings = socRows.reduce((s, r) => s + r.cnt, 0);
    let healthScore = 0;
    let avgSoc = 0;
    const zoneCounts = { ideal: 0, good: 0, caution: 0, stress: 0 };
    const socHist = Array.from({ length: 10 }, () => 0);

    if (totalReadings > 0) {
      let weightedSoc = 0;
      let weightedScore = 0;
      for (const { soc, cnt } of socRows) {
        const level = parseInt(soc);
        weightedSoc += level * cnt;
        // 점수: 이상 범위 내 = 고점수, 범위 밖 = 패널티
        let pointScore;
        if (level >= RANGE_LOW && level <= RANGE_HIGH) {
          // 범위 내: 중심에서 멀어질수록 약간 감점 (최소 70점)
          const halfRange = (RANGE_HIGH - RANGE_LOW) / 2;
          const distFromCenter = Math.abs(level - OPTIMAL_CENTER) / halfRange;
          pointScore = 100 - distFromCenter * 30;
        } else {
          // 범위 밖: 급격히 감점
          const overLow = level < RANGE_LOW ? (RANGE_LOW - level) / RANGE_LOW : 0;
          const overHigh = level > RANGE_HIGH ? (level - RANGE_HIGH) / (100 - RANGE_HIGH) : 0;
          const over = Math.max(overLow, overHigh);
          pointScore = Math.max(0, 60 - over * 100);
        }
        weightedScore += pointScore * cnt;
        // 구간 분류
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
      }
      avgSoc = parseFloat((weightedSoc / totalReadings).toFixed(1));
      healthScore = Math.round(weightedScore / totalReadings);
    }

    const grade = healthScore >= 90 ? 'A+' : healthScore >= 80 ? 'A'
      : healthScore >= 70 ? 'B+' : healthScore >= 60 ? 'B'
      : healthScore >= 50 ? 'C+' : healthScore >= 40 ? 'C'
      : healthScore >= 30 ? 'D' : 'F';

    // 팁 생성 (LFP 맞춤)
    const tips = [];
    if (isLFP) {
      if (avgSoc < 50) tips.push('LFP 배터리는 높은 SOC를 유지해도 수명 영향이 적습니다. Tesla는 100% 충전을 권장합니다');
      if (avgSoc >= 50 && avgSoc <= 80) tips.push('LFP 배터리는 주기적으로 100% 충전하면 BMS 캘리브레이션에 도움됩니다');
      if (avgSoc > 80) tips.push('LFP 배터리에 이상적인 관리입니다. 20% 이하 방전만 피하면 됩니다');
      if (avgSoc < 20) tips.push('20% 이하로 자주 방전하면 셀 스트레스가 증가합니다');
    } else {
      if (avgSoc > 80) tips.push('충전 상한을 80%로 낮추면 배터리 수명이 크게 향상됩니다');
      if (avgSoc < 20) tips.push('배터리를 20% 이하로 자주 방전하면 셀 스트레스가 증가합니다');
      if (tips.length === 0) tips.push('20~80% 범위 내에서 충전하면 배터리 건강에 좋습니다');
    }
    if (zoneCounts.ideal > totalReadings * 0.5 && tips.length === 0) tips.push('이상적인 배터리 관리를 하고 있습니다!');
    if (tips.length === 0) tips.push(`${RANGE_LOW}~${RANGE_HIGH}% 범위 내에서 사용하면 배터리 건강에 좋습니다`);

    return Response.json({
      weekly,
      daily_records: {
        max_charge: fmtCharge(dailyMaxChargeResult.rows[0]),
        min_charge: fmtCharge(dailyMinChargeResult.rows[0]),
        max_consume: fmtDrive(dailyMaxDriveResult.rows[0]),
        min_consume: fmtDrive(dailyMinDriveResult.rows[0]),
      },
      histogram: {
        start_level: histStart,
        end_level: histEnd,
        start_modal_range: `${startModal * 10}–${startModal * 10 + 10}%`,
        end_modal_range: `${endModal * 10}–${endModal * 10 + 10}%`,
      },
      health: {
        score: healthScore,
        grade,
        avg_soc: avgSoc,
        optimal_center: OPTIMAL_CENTER,
        range_low: RANGE_LOW,
        range_high: RANGE_HIGH,
        battery_type: isLFP ? 'LFP' : 'NCA/NMC',
        total_readings: totalReadings,
        soc_histogram: socHist,
        zone_pct: {
          ideal: totalReadings > 0 ? Math.round(zoneCounts.ideal / totalReadings * 100) : 0,
          good: totalReadings > 0 ? Math.round(zoneCounts.good / totalReadings * 100) : 0,
          caution: totalReadings > 0 ? Math.round(zoneCounts.caution / totalReadings * 100) : 0,
          stress: totalReadings > 0 ? Math.round(zoneCounts.stress / totalReadings * 100) : 0,
        },
        tips,
      },
      cycle: {
        total_kwh: parseFloat(totalKwhEffective.toFixed(1)),
        battery_capacity_kwh: batteryCapacity,
        total_cycles: totalCycles,
        this_week_kwh: parseFloat(thisWeekKwhEffective.toFixed(1)),
        this_week_cycles: thisWeekCycles,
        this_month_kwh: parseFloat(thisMonthKwhEffective.toFixed(1)),
        this_month_cycles: thisMonthCycles,
        avg_monthly_cycles: avgMonthlyCycles,
        odometer_km: Math.round(odometer),
        is_estimated: isEstimated,
      },
    });
  } catch (err) {
    console.error('/api/battery error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
