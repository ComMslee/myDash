import pool from '@/lib/db';

// 가족 > 축제 — TourAPI 폴링 결과 캐시 테이블.
// 폴링은 GHA cron (월·수·금 03:00 KST) → POST /api/family/festivals/refresh.
// GET /api/family/festivals 는 이 테이블만 SELECT (외부 호출 X).

let schemaReady = false;

export async function ensureSchema(client = pool) {
  if (schemaReady) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS family_festivals (
      id           TEXT PRIMARY KEY,
      title        TEXT NOT NULL,
      start_date   TEXT NOT NULL,
      end_date     TEXT NOT NULL,
      addr         TEXT,
      area_code    INTEGER,
      sigungu_code INTEGER,
      lat          DOUBLE PRECISION,
      lng          DOUBLE PRECISION,
      image        TEXT,
      thumbnail    TEXT,
      tel          TEXT,
      fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_family_festivals_dates ON family_festivals(start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_family_festivals_area  ON family_festivals(area_code);
  `);
  schemaReady = true;
}

// 단일 정규화 row 를 INSERT … ON CONFLICT UPDATE.
// 입력은 GET API 에서 쓰는 normalize() 출력과 동일 형태.
export async function upsertFestival(row, client = pool) {
  if (!row || !row.id || !row.startDate || !row.endDate) return false;
  const toInt = (v) => {
    if (v == null || v === '') return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };
  await client.query(
    `INSERT INTO family_festivals
       (id, title, start_date, end_date, addr, area_code, sigungu_code, lat, lng, image, thumbnail, tel, fetched_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW())
     ON CONFLICT (id) DO UPDATE SET
       title        = EXCLUDED.title,
       start_date   = EXCLUDED.start_date,
       end_date     = EXCLUDED.end_date,
       addr         = EXCLUDED.addr,
       area_code    = EXCLUDED.area_code,
       sigungu_code = EXCLUDED.sigungu_code,
       lat          = EXCLUDED.lat,
       lng          = EXCLUDED.lng,
       image        = EXCLUDED.image,
       thumbnail    = EXCLUDED.thumbnail,
       tel          = EXCLUDED.tel,
       fetched_at   = NOW()`,
    [
      row.id,
      row.title || '',
      row.startDate,
      row.endDate,
      row.addr || null,
      toInt(row.areaCode),
      toInt(row.sigunguCode),
      row.lat ?? null,
      row.lng ?? null,
      row.image || null,
      row.thumbnail || null,
      row.tel || null,
    ],
  );
  return true;
}

// 다수 row 를 동일 트랜잭션으로 upsert. 부분 실패는 throw 해서 호출자가 롤백.
export async function upsertMany(rows) {
  await ensureSchema();
  let count = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of rows) {
      const ok = await upsertFestival(r, client);
      if (ok) count += 1;
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return count;
}

// from/to 는 YYYYMMDD 문자열. areaCode 는 정수 또는 빈 문자열.
// 시작일 오름차순으로 size 만큼 반환.
export async function selectByRange({ from, to, areaCode, size }) {
  await ensureSchema();
  const params = [from, to];
  let where = `start_date <= $2 AND end_date >= $1`;
  if (areaCode) {
    params.push(parseInt(areaCode, 10));
    where += ` AND area_code = $${params.length}`;
  }
  params.push(Math.min(Math.max(Number(size) || 20, 1), 100));
  const limitIdx = params.length;
  const r = await pool.query(
    `SELECT id, title, start_date, end_date, addr, area_code, sigungu_code,
            lat, lng, image, thumbnail, tel, fetched_at
       FROM family_festivals
      WHERE ${where}
      ORDER BY start_date ASC, id ASC
      LIMIT $${limitIdx}`,
    params,
  );
  return r.rows.map((row) => ({
    id: row.id,
    title: row.title,
    startDate: row.start_date,
    endDate: row.end_date,
    addr: row.addr,
    areaCode: row.area_code,
    sigunguCode: row.sigungu_code,
    lat: row.lat,
    lng: row.lng,
    image: row.image,
    thumbnail: row.thumbnail,
    tel: row.tel,
    fetchedAt: row.fetched_at,
  }));
}

// 같은 필터에 매칭되는 총 개수 (페이지네이션·UI 카운트용).
export async function countByRange({ from, to, areaCode }) {
  await ensureSchema();
  const params = [from, to];
  let where = `start_date <= $2 AND end_date >= $1`;
  if (areaCode) {
    params.push(parseInt(areaCode, 10));
    where += ` AND area_code = $${params.length}`;
  }
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM family_festivals WHERE ${where}`,
    params,
  );
  return r.rows[0]?.n || 0;
}

// end_date 가 오늘(KST)보다 이전인 축제 삭제. 폴링 후 호출.
export async function cleanupExpired(todayYmdKst) {
  await ensureSchema();
  const r = await pool.query(
    `DELETE FROM family_festivals WHERE end_date < $1`,
    [todayYmdKst],
  );
  return r.rowCount || 0;
}

// 가장 최근 fetched_at — stale 판단용.
export async function latestFetchedAt() {
  await ensureSchema();
  const r = await pool.query(`SELECT MAX(fetched_at) AS t FROM family_festivals`);
  return r.rows[0]?.t || null;
}
