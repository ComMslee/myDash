import pool from '@/lib/db';

// 한국 공휴일 — KASI 특일정보(getRestDeInfo) 결과 캐시.
// /api/holidays?year=YYYY 가 lazy refresh: 캐시 없거나 fetched_at > 30일 → KASI 재조회.
// 음력 공휴일·대체공휴일·임시공휴일은 매년 변동 가능 → TTL 30일로 짧게.

let schemaReady = false;

export async function ensureSchema(client = pool) {
  if (schemaReady) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS dash_holidays (
      year       INTEGER NOT NULL,
      dateymd    TEXT    NOT NULL,
      name       TEXT    NOT NULL,
      is_holiday BOOLEAN NOT NULL DEFAULT TRUE,
      PRIMARY KEY (year, dateymd, name)
    );
    CREATE TABLE IF NOT EXISTS dash_holidays_meta (
      year       INTEGER PRIMARY KEY,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_dash_holidays_dateymd ON dash_holidays(dateymd);
  `);
  schemaReady = true;
}

export async function selectByYear(year) {
  await ensureSchema();
  const r = await pool.query(
    `SELECT dateymd, name, is_holiday
       FROM dash_holidays
      WHERE year = $1 AND is_holiday = TRUE
      ORDER BY dateymd`,
    [year],
  );
  return r.rows;
}

export async function getMeta(year) {
  await ensureSchema();
  const r = await pool.query(
    `SELECT fetched_at FROM dash_holidays_meta WHERE year = $1`,
    [year],
  );
  return r.rows[0]?.fetched_at || null;
}

// rows: [{ dateymd: 'YYYYMMDD', name, isHoliday }]. 트랜잭션으로 해당 연도 전체 교체.
export async function replaceYear(year, rows) {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM dash_holidays WHERE year = $1`, [year]);
    for (const r of rows) {
      if (!r?.dateymd || !r?.name) continue;
      await client.query(
        `INSERT INTO dash_holidays (year, dateymd, name, is_holiday)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (year, dateymd, name) DO UPDATE SET is_holiday = EXCLUDED.is_holiday`,
        [year, r.dateymd, r.name, r.isHoliday !== false],
      );
    }
    await client.query(
      `INSERT INTO dash_holidays_meta (year, fetched_at)
       VALUES ($1, NOW())
       ON CONFLICT (year) DO UPDATE SET fetched_at = NOW()`,
      [year],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return rows.length;
}
