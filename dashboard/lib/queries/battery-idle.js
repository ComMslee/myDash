// 대기 중 배터리 소모(뱀파이어 드레인) + 최근 충전 세션
import pool from '@/lib/db';

/**
 * drives + charging_processes를 타임라인으로 묶어 idle 구간 계산.
 * soc_drop = 직전 이벤트 종료 SOC - 다음 이벤트 시작 SOC
 * climate_minutes = idle 구간 중 is_climate_on=true였던 추정 시간(분).
 *   각 positions 샘플의 is_climate_on 값에 다음 샘플까지의 간격(최대 5분)을 가중.
 *   슬립 중에는 폴링이 없으므로 gap 상한으로 과대추정을 방지.
 * 30분(1800초) 이상 idle만 반환, 최근 20건.
 */
export function queryIdleDrain(carId) {
  return pool.query(`
    WITH timeline AS (
      SELECT start_date AS ts, end_date AS te,
        (SELECT battery_level FROM positions WHERE id = start_position_id) AS start_soc,
        (SELECT battery_level FROM positions WHERE id = end_position_id) AS end_soc,
        'drive'::text AS ev_type
      FROM drives WHERE car_id = $1 AND end_date IS NOT NULL AND end_position_id IS NOT NULL
      UNION ALL
      SELECT start_date, end_date, start_battery_level::int, end_battery_level::int, 'charge'::text
      FROM charging_processes WHERE car_id = $1 AND end_date IS NOT NULL AND end_battery_level IS NOT NULL
      ORDER BY ts
    ),
    idle AS (
      SELECT
        te AS idle_start,
        LEAD(ts) OVER (ORDER BY ts) AS idle_end,
        end_soc AS soc_start,
        LEAD(start_soc) OVER (ORDER BY ts) AS soc_end,
        LEAD(ev_type) OVER (ORDER BY ts) AS next_type
      FROM timeline
    ),
    filtered AS (
      SELECT idle_start, idle_end, soc_start, soc_end, next_type,
        GREATEST(soc_start - soc_end, 0) AS soc_drop,
        ROUND(EXTRACT(EPOCH FROM idle_end - idle_start) / 3600, 1)::float AS idle_hours
      FROM idle
      WHERE idle_end IS NOT NULL
        AND EXTRACT(EPOCH FROM idle_end - idle_start) > 1800
        AND soc_start IS NOT NULL AND soc_end IS NOT NULL
      ORDER BY idle_start DESC
      LIMIT 20
    )
    SELECT f.idle_start, f.idle_end, f.soc_start, f.soc_end, f.next_type,
      f.soc_drop, f.idle_hours,
      COALESCE(c.climate_minutes, 0)::float AS climate_minutes,
      COALESCE(c.spans, '[]'::jsonb) AS climate_spans
    FROM filtered f
    LEFT JOIN LATERAL (
      -- LATERAL 안에는 CTE 대신 중첩 서브쿼리 사용 (Postgres planner 호환)
      SELECT
        COALESCE(
          jsonb_agg(jsonb_build_object(
            's', FLOOR(EXTRACT(EPOCH FROM run_start) * 1000)::bigint,
            'e', FLOOR(EXTRACT(EPOCH FROM run_end) * 1000)::bigint
          ) ORDER BY run_start),
          '[]'::jsonb
        ) AS spans,
        ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (run_end - run_start))), 0)::numeric / 60, 1) AS climate_minutes
      FROM (
        -- island별 공조 구간 (3분 미만 토글은 HAVING으로 제외)
        SELECT MIN(date) AS run_start, MAX(row_end) AS run_end
        FROM (
          -- 300초 초과 공백을 경계로 island_id 누적 증가
          SELECT date, row_end,
                 SUM(new_island_flag) OVER (ORDER BY date) AS island_id
          FROM (
            SELECT date,
              LEAST(COALESCE(next_date, date + INTERVAL '60 seconds'), date + INTERVAL '5 minutes') AS row_end,
              CASE
                WHEN LAG(date) OVER (ORDER BY date) IS NULL THEN 1
                WHEN EXTRACT(EPOCH FROM (date - LAG(date) OVER (ORDER BY date))) > 300 THEN 1
                ELSE 0
              END AS new_island_flag
            FROM (
              SELECT date, is_climate_on,
                     LEAD(date) OVER (ORDER BY date) AS next_date
              FROM positions
              WHERE car_id = $1 AND date BETWEEN f.idle_start AND f.idle_end
            ) raw_pos
            WHERE is_climate_on = true
          ) flagged
        ) islanded
        GROUP BY island_id
        -- 3분 미만 짧은 공조 토글(ON/OFF 노이즈) 제외
        HAVING EXTRACT(EPOCH FROM (MAX(row_end) - MIN(date))) >= 180
      ) runs
    ) c ON true
    ORDER BY f.idle_start DESC
  `, [carId]);
}

/** 최근 14일 충전 세션 (idle 타임라인과 겹쳐 표시용) */
export function queryChargingSessions(carId) {
  return pool.query(`
    SELECT start_date, end_date,
           start_battery_level::int AS soc_start,
           end_battery_level::int AS soc_end,
           (end_battery_level - start_battery_level)::int AS soc_added,
           ROUND(EXTRACT(EPOCH FROM end_date - start_date) / 3600, 2)::float AS duration_hours
    FROM charging_processes
    WHERE car_id = $1
      AND end_date IS NOT NULL
      AND start_battery_level IS NOT NULL
      AND end_battery_level IS NOT NULL
      AND end_date >= NOW() - INTERVAL '14 days'
    ORDER BY start_date DESC
  `, [carId]);
}
