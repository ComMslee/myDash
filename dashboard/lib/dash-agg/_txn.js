import pool from '@/lib/db';

// withTxn — BEGIN/COMMIT/ROLLBACK/release 보일러플레이트 한 곳으로.
// 사용: const result = await withTxn(async (client) => { ...; return value; });
// fn 이 throw 하면 ROLLBACK 후 재throw, 정상이면 COMMIT 후 결과 반환. release 는 항상.
export async function withTxn(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
