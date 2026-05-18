import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import pool from '@/lib/db';
import { ensureSchema } from '@/lib/queries/schedules';

// Tesla Fleet API 토큰 저장 + 암호화 + 자동 refresh.
// 저장 형식: dash_tesla_tokens (singleton id=1 row) — access/refresh 각각 AES-256-GCM 암호.
// 키 회수 시나리오: TESLA_TOKEN_ENC_KEY 분실 → 토큰 복호화 불가 → 재발급 필요. .env 변동 시 주의.

const ENC_KEY_HEX = process.env.TESLA_TOKEN_ENC_KEY || '';

function getKey() {
  if (!/^[0-9a-fA-F]{64}$/.test(ENC_KEY_HEX)) {
    throw new Error('TESLA_TOKEN_ENC_KEY missing or not 32 bytes hex');
  }
  return Buffer.from(ENC_KEY_HEX, 'hex');
}

function encrypt(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // 단일 base64 페이로드 — iv(12) || tag(16) || ciphertext
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(b64) {
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

async function ensureTokensSchema() {
  await ensureSchema();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dash_tesla_tokens (
      id                INTEGER PRIMARY KEY DEFAULT 1,
      access_token_enc  TEXT NOT NULL,
      refresh_token_enc TEXT NOT NULL,
      scope             TEXT,
      expires_at        TIMESTAMPTZ NOT NULL,
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (id = 1)
    );
  `);
}

export async function saveTokens({ access_token, refresh_token, expires_in, scope }) {
  await ensureTokensSchema();
  const expires_at = new Date(Date.now() + Math.max(60, (expires_in || 0) - 60) * 1000);
  await pool.query(
    `INSERT INTO dash_tesla_tokens
       (id, access_token_enc, refresh_token_enc, scope, expires_at, updated_at)
     VALUES (1, $1, $2, $3, $4, NOW())
     ON CONFLICT (id) DO UPDATE SET
       access_token_enc = EXCLUDED.access_token_enc,
       refresh_token_enc = EXCLUDED.refresh_token_enc,
       scope = EXCLUDED.scope,
       expires_at = EXCLUDED.expires_at,
       updated_at = NOW()`,
    [encrypt(access_token), encrypt(refresh_token), scope || null, expires_at],
  );
}

export async function getTokenRow() {
  await ensureTokensSchema();
  const r = await pool.query(`SELECT * FROM dash_tesla_tokens WHERE id=1`);
  return r.rows[0] || null;
}

export async function clearTokens() {
  await ensureTokensSchema();
  await pool.query(`DELETE FROM dash_tesla_tokens WHERE id=1`);
}

// 만료 1분 이내거나 만료된 경우 refresh — refresh_token 으로 새 access_token 받아 저장.
// 동시 호출 방지 위해 module-level Promise singleton.
let refreshInFlight = null;

async function doRefresh(row) {
  const refresh = decrypt(row.refresh_token_enc);
  const base = process.env.TESLA_FLEET_OAUTH_BASE || 'https://auth.tesla.com/oauth2/v3';
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.TESLA_FLEET_CLIENT_ID || '',
    refresh_token: refresh,
  });
  const res = await fetch(`${base}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`refresh failed: HTTP ${res.status} ${txt.slice(0, 200)}`);
  }
  const j = await res.json();
  await saveTokens({
    access_token: j.access_token,
    refresh_token: j.refresh_token || refresh,  // Tesla 가 신규 refresh 안 줄 수도 — 기존 유지
    expires_in: j.expires_in,
    scope: j.scope || row.scope,
  });
  return j.access_token;
}

export async function getAccessToken() {
  const row = await getTokenRow();
  if (!row) throw new Error('Tesla tokens not configured — connect via /api/tesla/oauth/start');
  if (new Date(row.expires_at).getTime() > Date.now()) {
    return decrypt(row.access_token_enc);
  }
  if (!refreshInFlight) {
    refreshInFlight = doRefresh(row).finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export async function getConnectionStatus() {
  const row = await getTokenRow();
  if (!row) return { connected: false };
  return {
    connected: true,
    scope: row.scope,
    expires_at: row.expires_at,
    updated_at: row.updated_at,
  };
}
