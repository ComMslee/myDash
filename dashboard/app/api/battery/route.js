import pool from '@/lib/db';
import { KWH_PER_KM, RATED_RANGE_MAX_KM } from '@/lib/constants';
import { KST_OFFSET_MS } from '@/lib/kst';
import {
  queryCapacityFromCharge, queryCapacityFromPositions,
  queryOdometer, queryTotalKwh, queryTotalDriveDischargeKm,
  queryFirstCharge, queryFirstDrive,
  queryThisWeekCharge, queryThisWeekDischarge,
  queryThisMonthCharge, queryThisMonthDischarge,
  queryWeeklyCharge, queryWeeklyDrive,
  computeBatteryCapacity, computeCycles,
} from '@/lib/queries/battery-capacity';
import {
  queryChargeMatrix, queryHistStart, queryHistEnd, querySocDist,
  buildHist, computeHealth,
} from '@/lib/queries/battery-health';
import { queryAllDailyRecords } from '@/lib/queries/battery-records';
import { queryIdleDrain, queryChargingSessions } from '@/lib/queries/battery-idle';

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

    const KST = KST_OFFSET_MS;
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

    // 최근 1달 / 6개월 필터
    const oneMonthAgoUTC = new Date(now.getTime() - 30 * 86400000);
    const sixMonthsAgoUTC = new Date(now.getTime() - 180 * 86400000);

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
      chargeMatrixResult,
      histStartResult,
      histEndResult,
      socDistResult,
      idleDrainResult,
      dailyRecords,
      chargingSessionsResult,
    ] = await Promise.all([
      queryCapacityFromCharge(carId),
      queryCapacityFromPositions(carId),
      queryOdometer(carId),
      queryTotalKwh(carId),
      queryTotalDriveDischargeKm(carId),
      queryFirstCharge(carId),
      queryFirstDrive(carId),
      queryThisWeekCharge(carId, curWeekMonUTC.toISOString()),
      queryThisWeekDischarge(carId, curWeekMonUTC.toISOString()),
      queryThisMonthCharge(carId, thisMonthStartUTC.toISOString()),
      queryThisMonthDischarge(carId, thisMonthStartUTC.toISOString()),
      queryWeeklyCharge(carId, twelveWeeksAgoUTC.toISOString()),
      queryWeeklyDrive(carId, twelveWeeksAgoUTC.toISOString()),
      queryChargeMatrix(carId),
      queryHistStart(carId),
      queryHistEnd(carId),
      querySocDist(carId),
      queryIdleDrain(carId),
      queryAllDailyRecords(carId, { oneMonthAgo: oneMonthAgoUTC, sixMonthsAgo: sixMonthsAgoUTC }),
      queryChargingSessions(carId),
    ]);

    // 배터리 용량 (1순위 충전역산 → 2순위 positions 역산 → 3순위 상수)
    const batteryCapacity = computeBatteryCapacity(
      capacityFromChargeResult.rows[0], capacityFromPositionsResult.rows[0]
    );

    // 누적 주행거리
    const odometer = odometerResult.rows[0]?.odometer || 0;
    const totalKwh = parseFloat(totalKwhResult.rows[0].total_kwh);

    // 첫 활동일 (충전/주행 중 빠른 쪽)
    const firstChargeDate = firstChargeResult.rows[0]?.first_date;
    const firstDriveDate = firstDriveResult.rows[0]?.first_date;
    const firstDate = firstChargeDate && firstDriveDate
      ? new Date(Math.min(new Date(firstChargeDate), new Date(firstDriveDate)))
      : firstChargeDate ? new Date(firstChargeDate)
      : firstDriveDate ? new Date(firstDriveDate)
      : null;

    const { totalCycles, isEstimated, avgMonthlyCycles } = computeCycles({
      batteryCapacity, totalKwh, odometer, firstDate, now,
    });

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

    // 일간 레코드 포맷팅
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
    const fmtRecordBlock = (block) => ({
      max_charge: fmtCharge(block.max_charge),
      min_charge: fmtCharge(block.min_charge),
      max_consume: fmtDrive(block.max_consume),
      min_consume: fmtDrive(block.min_consume),
    });

    // 히스토그램 (50빈, 2% 단위)
    const histStart = buildHist(histStartResult.rows);
    const histEnd = buildHist(histEndResult.rows);
    const startModal = histStart.indexOf(Math.max(...histStart));
    const endModal = histEnd.indexOf(Math.max(...histEnd));

    // ── 배터리 헬스 점수 (LFP: 이상 20-100%, 최적 60%) ──
    // 판별: Model Y SR (상하이, trim_badging=50) = LFP
    const isLFP = true; // Model Y RWD/SR = LFP (향후 DB 기반 자동 판별 가능)
    const health = computeHealth(socDistResult.rows, { isLFP });

    return Response.json({
      weekly,
      daily_records: {
        all: fmtRecordBlock(dailyRecords.all),
        month: fmtRecordBlock(dailyRecords.month),
        six_month: fmtRecordBlock(dailyRecords.six_month),
      },
      histogram: {
        start_level: histStart,
        end_level: histEnd,
        start_modal_range: `${startModal * 2}–${startModal * 2 + 2}%`,
        end_modal_range: `${endModal * 2}–${endModal * 2 + 2}%`,
        matrix: {
          buckets: 20,
          bucket_size: 5,
          cells: chargeMatrixResult.rows.map(r => ({
            start: r.start_bucket,
            end: r.end_bucket,
            cnt: r.cnt,
          })),
        },
      },
      health: {
        score: health.healthScore,
        grade: health.grade,
        avg_soc: health.avgSoc,
        optimal_center: health.OPTIMAL_CENTER,
        range_low: health.RANGE_LOW,
        range_high: health.RANGE_HIGH,
        battery_type: health.isLFP ? 'LFP' : 'NCA/NMC',
        total_readings: health.totalReadings,
        soc_histogram: health.socHist,
        soc_histogram_2: health.socHist2,
        zone_pct: {
          ideal: health.totalReadings > 0 ? Math.round(health.zoneCounts.ideal / health.totalReadings * 100) : 0,
          good: health.totalReadings > 0 ? Math.round(health.zoneCounts.good / health.totalReadings * 100) : 0,
          caution: health.totalReadings > 0 ? Math.round(health.zoneCounts.caution / health.totalReadings * 100) : 0,
          stress: health.totalReadings > 0 ? Math.round(health.zoneCounts.stress / health.totalReadings * 100) : 0,
        },
        tips: health.tips,
      },
      idle_drain: idleDrainResult.rows.map(r => ({
        idle_start: r.idle_start,
        idle_end: r.idle_end,
        soc_start: parseInt(r.soc_start),
        soc_end: parseInt(r.soc_end),
        soc_drop: parseInt(r.soc_drop),
        idle_hours: parseFloat(r.idle_hours),
        next_type: r.next_type,
        climate_minutes: parseFloat(r.climate_minutes) || 0,
      })),
      charging_sessions: chargingSessionsResult.rows.map(r => ({
        start: r.start_date,
        end: r.end_date,
        soc_start: parseInt(r.soc_start),
        soc_end: parseInt(r.soc_end),
        soc_added: parseInt(r.soc_added),
        duration_hours: parseFloat(r.duration_hours),
      })),
    });
  } catch (err) {
    console.error('/api/battery error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
