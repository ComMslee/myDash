import pool from '@/lib/db';

// 모듈 라이프타임당 1회만 CREATE TABLE IF NOT EXISTS 시도 (성공 후 노옵).
let tableReady = false;

export async function ensureSchema() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dash_daily_drive_agg (
      car_id        smallint NOT NULL,
      day           date     NOT NULL,
      dow           smallint NOT NULL,
      hour          smallint NOT NULL,
      ticks_10min   integer  NOT NULL DEFAULT 0,
      distance_km   real     NOT NULL DEFAULT 0,
      duration_min  integer  NOT NULL DEFAULT 0,
      drive_count   integer  NOT NULL DEFAULT 0,
      used_km       real     NOT NULL DEFAULT 0,
      PRIMARY KEY (car_id, day, hour)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dash_daily_charge_agg (
      car_id        smallint NOT NULL,
      day           date     NOT NULL,
      dow           smallint NOT NULL,
      hour          smallint NOT NULL,
      ticks_10min   integer  NOT NULL DEFAULT 0,
      energy_kwh    real     NOT NULL DEFAULT 0,
      charge_count  integer  NOT NULL DEFAULT 0,
      home_count    integer  NOT NULL DEFAULT 0,
      fast_count    integer  NOT NULL DEFAULT 0,
      PRIMARY KEY (car_id, day, hour)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dash_monthly_insights (
      car_id                    smallint NOT NULL,
      year                      smallint NOT NULL,
      month                     smallint NOT NULL,
      distance_km               real     NOT NULL DEFAULT 0,
      drive_count               integer  NOT NULL DEFAULT 0,
      duration_min              integer  NOT NULL DEFAULT 0,
      used_km                   real     NOT NULL DEFAULT 0,
      max_distance_km           real     NOT NULL DEFAULT 0,
      max_duration_min          integer  NOT NULL DEFAULT 0,
      max_speed                 integer  NOT NULL DEFAULT 0,
      total_kwh                 real     NOT NULL DEFAULT 0,
      charge_count              integer  NOT NULL DEFAULT 0,
      avg_kwh                   real     NOT NULL DEFAULT 0,
      home_charges              integer  NOT NULL DEFAULT 0,
      other_charges             integer  NOT NULL DEFAULT 0,
      fast_charges              integer  NOT NULL DEFAULT 0,
      slow_charges              integer  NOT NULL DEFAULT 0,
      best_long_drive_id        bigint,
      best_long_drive_distance  real,
      best_eff_drive_id         bigint,
      best_eff_drive_distance   real,
      best_eff_drive_wh_km      real,
      PRIMARY KEY (car_id, year, month)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dash_top_drives_cache (
      car_id     smallint NOT NULL,
      metric     text     NOT NULL,
      rank       smallint NOT NULL,
      drive_id   bigint,
      value      real,
      start_date timestamptz,
      PRIMARY KEY (car_id, metric, rank)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dash_place_clusters (
      car_id          smallint     NOT NULL,
      bin_lat         numeric(7,4) NOT NULL,
      bin_lon         numeric(7,4) NOT NULL,
      visit_count     integer      NOT NULL DEFAULT 0,
      top_origin_lat  real,
      top_origin_lon  real,
      last_visited_at timestamptz,
      PRIMARY KEY (car_id, bin_lat, bin_lon)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dash_place_geo (
      coord_key  text PRIMARY KEY,
      label      text,
      updated_at timestamptz DEFAULT now()
    )
  `);
  tableReady = true;
}
