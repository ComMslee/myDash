import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST || 'database',
  port: 5432,
  user: process.env.TM_DB_USER,
  password: process.env.TM_DB_PASS,
  database: process.env.TM_DB_NAME || 'teslamate',
});

export default pool;
