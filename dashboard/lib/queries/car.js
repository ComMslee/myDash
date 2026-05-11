import pool from '@/lib/db';

/**
 * 단일 차량 가정 — `cars` 첫 row 반환. 차량이 없으면 null.
 * 다중 차량 도입 시 carId 인자 추가 또는 별도 helper 도입.
 */
export async function getDefaultCar(client = pool) {
  const r = await client.query(`SELECT id, name FROM cars LIMIT 1`);
  return r.rows[0] ?? null;
}
