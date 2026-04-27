// 집충전기 관련 테이블 DDL — `home-charger-cache`, `poll-log`, `usage`, `fleet-stats`가 공유.
// 컨테이너 재시작(배포)마다 카운트 보존 — DROP 금지, IF NOT EXISTS / ALTER ADD COLUMN IF NOT EXISTS만 사용.

import pool from '@/lib/db';

let tableReady = false;

export async function ensureTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS charger_usage (
      stat_id    VARCHAR(20) NOT NULL,
      chger_id   VARCHAR(20) NOT NULL,
      hour       SMALLINT    NOT NULL,
      count      INTEGER     NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (stat_id, chger_id, hour)
    )
  `);
  await pool.query(`ALTER TABLE charger_usage ADD COLUMN IF NOT EXISTS stat_id VARCHAR(20) NOT NULL DEFAULT 'PI795111'`);
  await pool.query(`ALTER TABLE charger_usage ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS charger_usage_daily (
      stat_id    VARCHAR(20) NOT NULL,
      chger_id   VARCHAR(20) NOT NULL,
      date       DATE        NOT NULL,
      hour       SMALLINT    NOT NULL,
      count      INTEGER     NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (stat_id, chger_id, date, hour)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS charger_usage_daily_date_idx ON charger_usage_daily (date)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS home_charger_poll_log (
      date             DATE     NOT NULL,
      hour             SMALLINT NOT NULL,
      attempts         INTEGER  NOT NULL DEFAULT 0,
      successes        INTEGER  NOT NULL DEFAULT 0,
      partial          INTEGER  NOT NULL DEFAULT 0,
      retries          INTEGER  NOT NULL DEFAULT 0,
      retry_successes  INTEGER  NOT NULL DEFAULT 0,
      quota_hits       INTEGER  NOT NULL DEFAULT 0,
      manual_attempts  INTEGER  NOT NULL DEFAULT 0,
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (date, hour)
    )
  `);
  await pool.query(`ALTER TABLE home_charger_poll_log ADD COLUMN IF NOT EXISTS manual_attempts INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE home_charger_poll_log ADD COLUMN IF NOT EXISTS retry_successes INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE home_charger_poll_log ADD COLUMN IF NOT EXISTS warm_calls INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`CREATE INDEX IF NOT EXISTS home_charger_poll_log_date_idx ON home_charger_poll_log (date)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS home_charger_snapshot (
      cache_key  VARCHAR(20) PRIMARY KEY,
      payload    JSONB       NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL
    )
  `);
  tableReady = true;
}
