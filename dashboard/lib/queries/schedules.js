import pool from '@/lib/db';

// Tesla 자동화 스케줄러 — 시간/장소/날씨 3축 + 즉시 실행.
// 워커는 컨테이너 내부 setInterval (1분) — `lib/schedule-runner.js` (별도 모듈) 에서 호출.
// 실제 Tesla API 호출은 ENV TESLA_FLEET_API_ENABLED 로 게이팅 — 기본 false (dry_run).

let schemaReady = false;

export async function ensureSchema() {
  if (schemaReady) return;
  // 마이그레이션 — dash_geofences 폐기. TeslaMate `geofences` 테이블이 단일 진실원.
  // dash_location_events.geofence_id 의 FK 도 함께 제거 (TeslaMate id 직접 참조).
  await pool.query(`
    ALTER TABLE IF EXISTS dash_location_events
      DROP CONSTRAINT IF EXISTS dash_location_events_geofence_id_fkey;
    DROP TABLE IF EXISTS dash_geofences CASCADE;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dash_schedules (
      id               SERIAL PRIMARY KEY,
      name             TEXT NOT NULL,
      enabled          BOOLEAN NOT NULL DEFAULT TRUE,
      mode             TEXT NOT NULL DEFAULT 'auto',
      action           TEXT NOT NULL,
      action_params    JSONB NOT NULL DEFAULT '{}'::jsonb,
      trigger_config   JSONB NOT NULL DEFAULT '{}'::jsonb,
      skip_dates       JSONB NOT NULL DEFAULT '[]'::jsonb,
      valid_from       DATE,
      valid_until      DATE,
      apply_pause_mode BOOLEAN NOT NULL DEFAULT TRUE,
      last_run_at      TIMESTAMPTZ,
      last_run_status  TEXT,
      next_run_at      TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    -- wake_policy 제거 — 항상 깨워서 실행 (스케줄 본래 의도).
    -- wake 비용은 Fleet API 응답의 wake_required 로 사후 추적 (schedule-runner.js).
    ALTER TABLE dash_schedules DROP COLUMN IF EXISTS wake_policy;
    CREATE INDEX IF NOT EXISTS idx_dash_schedules_enabled_next
      ON dash_schedules(enabled, next_run_at);

    CREATE TABLE IF NOT EXISTS dash_schedule_executions (
      id             BIGSERIAL PRIMARY KEY,
      schedule_id    INTEGER REFERENCES dash_schedules(id) ON DELETE SET NULL,
      triggered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      trigger_source TEXT NOT NULL,
      action         TEXT NOT NULL,
      action_params  JSONB NOT NULL DEFAULT '{}'::jsonb,
      status         TEXT NOT NULL,
      reason         TEXT,
      api_calls      JSONB NOT NULL DEFAULT '{}'::jsonb,
      tesla_response JSONB,
      cost_estimate  NUMERIC(10,4) NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_dash_schedule_exec_sched_time
      ON dash_schedule_executions(schedule_id, triggered_at DESC);
    CREATE INDEX IF NOT EXISTS idx_dash_schedule_exec_time
      ON dash_schedule_executions(triggered_at DESC);

    CREATE TABLE IF NOT EXISTS dash_schedule_daily_stats (
      schedule_id   INTEGER REFERENCES dash_schedules(id) ON DELETE CASCADE,
      day           DATE NOT NULL,
      exec_count    INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      fail_count    INTEGER NOT NULL DEFAULT 0,
      skip_count    INTEGER NOT NULL DEFAULT 0,
      cost_sum      NUMERIC(10,4) NOT NULL DEFAULT 0,
      PRIMARY KEY (schedule_id, day)
    );

    CREATE TABLE IF NOT EXISTS dash_api_usage_monthly (
      month                   TEXT PRIMARY KEY,
      commands_count          INTEGER NOT NULL DEFAULT 0,
      wakes_count             INTEGER NOT NULL DEFAULT 0,
      vehicle_data_count      INTEGER NOT NULL DEFAULT 0,
      streaming_signals_count BIGINT  NOT NULL DEFAULT 0,
      estimated_cost          NUMERIC(10,4) NOT NULL DEFAULT 0,
      last_updated            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS dash_pause_periods (
      id         SERIAL PRIMARY KEY,
      from_date  DATE NOT NULL,
      until_date DATE NOT NULL,
      reason     TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS dash_location_events (
      id          BIGSERIAL PRIMARY KEY,
      geofence_id INTEGER NOT NULL,
      event_type  TEXT NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      lat         DOUBLE PRECISION,
      lng         DOUBLE PRECISION
    );
    CREATE INDEX IF NOT EXISTS idx_dash_location_events_time
      ON dash_location_events(occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_dash_location_events_geo_time
      ON dash_location_events(geofence_id, occurred_at DESC);
  `);
  schemaReady = true;
}

// ─────────────────────────────────────────────────────────────────────────
// Geofences — TeslaMate `geofences` 테이블이 단일 진실원.
// 추가/수정/삭제는 TeslaMate UI 에서 수행. 대시보드는 read-only.
// name 패턴으로 kind 자동 분류 (집/회사/그 외 커스텀).

function classifyKind(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('집') || n.includes('home') || n.includes('house')) return 'home';
  if (n.includes('회사') || n.includes('work') || n.includes('office')) return 'work';
  return 'custom';
}

export async function listGeofences() {
  await ensureSchema();
  const r = await pool.query(
    `SELECT id,
            name,
            latitude::float8  AS lat,
            longitude::float8 AS lng,
            radius::int       AS radius_m
       FROM geofences
      ORDER BY id ASC`,
  );
  return r.rows.map((row) => ({ ...row, kind: classifyKind(row.name) }));
}

// 추가/수정/삭제는 TeslaMate UI 에서 처리. API 단에서도 405 로 막음.
export async function upsertGeofence() {
  throw new Error('지오펜스 추가/수정은 TeslaMate UI 에서 처리합니다.');
}
export async function deleteGeofence() {
  throw new Error('지오펜스 삭제는 TeslaMate UI 에서 처리합니다.');
}

// ─────────────────────────────────────────────────────────────────────────
// Schedules CRUD

export async function listSchedules() {
  await ensureSchema();
  const r = await pool.query(
    `SELECT * FROM dash_schedules ORDER BY enabled DESC, id ASC`,
  );
  return r.rows;
}

export async function getSchedule(id) {
  await ensureSchema();
  const r = await pool.query(`SELECT * FROM dash_schedules WHERE id=$1`, [id]);
  return r.rows[0] || null;
}

export async function createSchedule(input) {
  await ensureSchema();
  const {
    name, enabled = true, mode = 'auto',
    action, action_params = {}, trigger_config = {},
    skip_dates = [], valid_from = null, valid_until = null,
    apply_pause_mode = true,
  } = input;
  const r = await pool.query(
    `INSERT INTO dash_schedules
       (name, enabled, mode, action, action_params, trigger_config,
        skip_dates, valid_from, valid_until, apply_pause_mode)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,$10)
     RETURNING *`,
    [
      name, enabled, mode, action,
      JSON.stringify(action_params), JSON.stringify(trigger_config),
      JSON.stringify(skip_dates), valid_from, valid_until, apply_pause_mode,
    ],
  );
  return r.rows[0];
}

export async function updateSchedule(id, patch) {
  await ensureSchema();
  const cur = await getSchedule(id);
  if (!cur) return null;
  const merged = { ...cur, ...patch };
  const r = await pool.query(
    `UPDATE dash_schedules SET
        name=$2, enabled=$3, mode=$4, action=$5,
        action_params=$6::jsonb, trigger_config=$7::jsonb,
        skip_dates=$8::jsonb, valid_from=$9, valid_until=$10,
        apply_pause_mode=$11, updated_at=NOW()
      WHERE id=$1
      RETURNING *`,
    [
      id, merged.name, merged.enabled, merged.mode, merged.action,
      JSON.stringify(merged.action_params || {}),
      JSON.stringify(merged.trigger_config || {}),
      JSON.stringify(merged.skip_dates || []),
      merged.valid_from, merged.valid_until, merged.apply_pause_mode,
    ],
  );
  return r.rows[0];
}

export async function deleteSchedule(id) {
  await ensureSchema();
  await pool.query(`DELETE FROM dash_schedules WHERE id=$1`, [id]);
}

// ─────────────────────────────────────────────────────────────────────────
// Execution log

export async function logExecution({
  schedule_id, trigger_source, action, action_params,
  status, reason, api_calls, tesla_response, cost_estimate,
}) {
  await ensureSchema();
  const r = await pool.query(
    `INSERT INTO dash_schedule_executions
       (schedule_id, trigger_source, action, action_params,
        status, reason, api_calls, tesla_response, cost_estimate)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7::jsonb,$8::jsonb,$9)
     RETURNING *`,
    [
      schedule_id, trigger_source, action,
      JSON.stringify(action_params || {}),
      status, reason || null,
      JSON.stringify(api_calls || {}),
      tesla_response ? JSON.stringify(tesla_response) : null,
      cost_estimate || 0,
    ],
  );
  return r.rows[0];
}

export async function listExecutions({ schedule_id = null, limit = 50 } = {}) {
  await ensureSchema();
  if (schedule_id) {
    const r = await pool.query(
      `SELECT * FROM dash_schedule_executions
        WHERE schedule_id=$1
        ORDER BY triggered_at DESC LIMIT $2`,
      [schedule_id, limit],
    );
    return r.rows;
  }
  const r = await pool.query(
    `SELECT * FROM dash_schedule_executions
      ORDER BY triggered_at DESC LIMIT $1`,
    [limit],
  );
  return r.rows;
}

// ─────────────────────────────────────────────────────────────────────────
// Monthly API usage

export async function getMonthlyUsage(month) {
  await ensureSchema();
  const r = await pool.query(
    `SELECT * FROM dash_api_usage_monthly WHERE month=$1`,
    [month],
  );
  return r.rows[0] || {
    month,
    commands_count: 0,
    wakes_count: 0,
    vehicle_data_count: 0,
    streaming_signals_count: 0,
    estimated_cost: 0,
  };
}

// Tesla Fleet API 단가 — 2025.01.01 기준. 변동 시 이 곳만 수정.
const COST = {
  commands: 0.001,
  wakes: 0.02,
  vehicle_data: 0.002,
  streaming_signals: 0.0001,
};

export function calcCost(calls = {}) {
  return (
    (calls.commands || 0) * COST.commands +
    (calls.wakes || 0) * COST.wakes +
    (calls.vehicle_data || 0) * COST.vehicle_data +
    (calls.streaming_signals || 0) * COST.streaming_signals
  );
}

export async function bumpMonthlyUsage(month, calls = {}) {
  await ensureSchema();
  const cost = calcCost(calls);
  await pool.query(
    `INSERT INTO dash_api_usage_monthly
       (month, commands_count, wakes_count, vehicle_data_count,
        streaming_signals_count, estimated_cost)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (month) DO UPDATE SET
       commands_count = dash_api_usage_monthly.commands_count + EXCLUDED.commands_count,
       wakes_count = dash_api_usage_monthly.wakes_count + EXCLUDED.wakes_count,
       vehicle_data_count = dash_api_usage_monthly.vehicle_data_count + EXCLUDED.vehicle_data_count,
       streaming_signals_count = dash_api_usage_monthly.streaming_signals_count + EXCLUDED.streaming_signals_count,
       estimated_cost = dash_api_usage_monthly.estimated_cost + EXCLUDED.estimated_cost,
       last_updated = NOW()`,
    [
      month,
      calls.commands || 0,
      calls.wakes || 0,
      calls.vehicle_data || 0,
      calls.streaming_signals || 0,
      cost,
    ],
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Pause periods (휴무 모드)

export async function listPausePeriods() {
  await ensureSchema();
  const r = await pool.query(
    `SELECT * FROM dash_pause_periods ORDER BY from_date DESC`,
  );
  return r.rows;
}

export async function createPausePeriod({ from_date, until_date, reason }) {
  await ensureSchema();
  const r = await pool.query(
    `INSERT INTO dash_pause_periods (from_date, until_date, reason)
     VALUES ($1, $2, $3) RETURNING *`,
    [from_date, until_date, reason || null],
  );
  return r.rows[0];
}

export async function deletePausePeriod(id) {
  await ensureSchema();
  await pool.query(`DELETE FROM dash_pause_periods WHERE id=$1`, [id]);
}

export async function isPausedOn(dateStr) {
  await ensureSchema();
  const r = await pool.query(
    `SELECT 1 FROM dash_pause_periods
      WHERE from_date <= $1::date AND until_date >= $1::date
      LIMIT 1`,
    [dateStr],
  );
  return r.rowCount > 0;
}

// ─────────────────────────────────────────────────────────────────────────
// Location events (지오펜스 진입·이탈 — 워커가 INSERT)

export async function recordLocationEvent({ geofence_id, event_type, lat, lng }) {
  await ensureSchema();
  await pool.query(
    `INSERT INTO dash_location_events (geofence_id, event_type, lat, lng)
     VALUES ($1, $2, $3, $4)`,
    [geofence_id, event_type, lat, lng],
  );
}

export async function recentLocationEvents({ since_minutes = 5 } = {}) {
  await ensureSchema();
  const r = await pool.query(
    `SELECT * FROM dash_location_events
      WHERE occurred_at >= NOW() - ($1 || ' minutes')::interval
      ORDER BY occurred_at DESC`,
    [String(since_minutes)],
  );
  return r.rows;
}
