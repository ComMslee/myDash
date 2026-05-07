import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST || 'database',
  user: process.env.TM_DB_USER,
  password: process.env.TM_DB_PASS,
  database: process.env.TM_DB_NAME || 'teslamate',
  max: 4,
});

pool.on('error', (err) => console.error('[db] pool error', err));

export async function getCarId() {
  const { rows } = await pool.query('SELECT id FROM cars ORDER BY id LIMIT 1');
  return rows[0]?.id ?? null;
}
