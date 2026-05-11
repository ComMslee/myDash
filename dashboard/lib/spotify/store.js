// Spotify refresh_token 영구 저장소 — DB 우선, fallback .env
//
// 왜 DB 인가:
//   .env 박제 토큰은 Spotify 가 자주 revoke 시키면 SSH 로 매번 갱신해야 함.
//   DB 저장 + 1클릭 재인증 페이지(/dev/spotify-relogin)로 운영 부담 제거.
//
// 단일 행 테이블: id=1 고정 (단일 사용자 가정).

import pool from '@/lib/db';

let tableReady = false;

export async function ensureTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS spotify_tokens (
      id            SMALLINT PRIMARY KEY DEFAULT 1,
      refresh_token TEXT     NOT NULL,
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (id = 1)
    )
  `);
  tableReady = true;
}

export async function getRefreshToken() {
  await ensureTable();
  const { rows } = await pool.query('SELECT refresh_token FROM spotify_tokens WHERE id = 1');
  if (rows.length && rows[0].refresh_token) return rows[0].refresh_token;
  // fallback — 첫 부트스트랩 (DB 비었을 때만 .env 사용)
  return process.env.SPOTIFY_REFRESH_TOKEN || null;
}

export async function setRefreshToken(token) {
  if (!token || typeof token !== 'string') throw new Error('invalid refresh_token');
  await ensureTable();
  await pool.query(
    `INSERT INTO spotify_tokens (id, refresh_token, updated_at)
     VALUES (1, $1, NOW())
     ON CONFLICT (id) DO UPDATE SET refresh_token = EXCLUDED.refresh_token, updated_at = NOW()`,
    [token],
  );
}

export async function getTokenInfo() {
  await ensureTable();
  const { rows } = await pool.query('SELECT updated_at FROM spotify_tokens WHERE id = 1');
  return {
    storedInDB: rows.length > 0,
    updatedAt: rows[0]?.updated_at?.toISOString() || null,
    envFallback: !rows.length && !!process.env.SPOTIFY_REFRESH_TOKEN,
  };
}
