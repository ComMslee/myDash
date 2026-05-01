import { pool } from './db.js';
import { getChat } from './telegram.js';

// 사용자/권한 스키마 — 부팅 시 idempotent 생성.
let _schemaReady = false;
export async function ensureAuthSchema() {
  if (_schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hub_users (
      chat_id       BIGINT PRIMARY KEY,
      name          TEXT,
      role          TEXT NOT NULL DEFAULT 'pending',
      registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      approved_at   TIMESTAMPTZ,
      approved_by   BIGINT
    );
    CREATE TABLE IF NOT EXISTS hub_permissions (
      chat_id    BIGINT NOT NULL REFERENCES hub_users(chat_id) ON DELETE CASCADE,
      feature    TEXT   NOT NULL,
      granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      granted_by BIGINT,
      PRIMARY KEY (chat_id, feature)
    );
    ALTER TABLE hub_users
      ADD COLUMN IF NOT EXISTS default_area_code TEXT;
  `);
  _schemaReady = true;
}

export async function getDefaultAreaCode(chatId) {
  await ensureAuthSchema();
  const { rows } = await pool.query(
    'SELECT default_area_code FROM hub_users WHERE chat_id = $1',
    [chatId],
  );
  return rows[0]?.default_area_code || null;
}

export async function setDefaultAreaCode(chatId, areaCode) {
  await ensureAuthSchema();
  const { rowCount } = await pool.query(
    'UPDATE hub_users SET default_area_code = $2 WHERE chat_id = $1',
    [chatId, areaCode || null],
  );
  return rowCount > 0;
}

// .env 의 TELEGRAM_CHAT_ID 를 root 로 강제. 매 부팅마다 멱등.
// name 은 NULL 로 두고 첫 메시지 때 텔레그램 first_name 으로 동기화.
export async function bootstrapRoot(rootChatId) {
  if (!rootChatId) return;
  await ensureAuthSchema();
  await pool.query(
    `INSERT INTO hub_users (chat_id, role, name, approved_at)
     VALUES ($1, 'root', NULL, NOW())
     ON CONFLICT (chat_id) DO UPDATE SET role = 'root', approved_at = COALESCE(hub_users.approved_at, NOW())`,
    [rootChatId],
  );
  // 과거 부트스트랩에서 박힌 'root' placeholder 정리.
  await pool.query(
    `UPDATE hub_users SET name = NULL WHERE chat_id = $1 AND name = 'root'`,
    [rootChatId],
  );
}

// name 이 비어 있는 사용자(특히 env 부트스트랩 root) 들을 텔레그램 getChat 으로 일괄 채움.
// 부팅 시 호출. getChat 이 실패하면 그 사용자만 건너뛰고 계속 진행.
export async function syncMissingNames() {
  await ensureAuthSchema();
  const { rows } = await pool.query(
    "SELECT chat_id::text FROM hub_users WHERE name IS NULL OR name = ''",
  );
  for (const { chat_id } of rows) {
    const chat = await getChat(chat_id);
    if (!chat) continue;
    const name = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || null;
    if (!name) continue;
    await pool.query('UPDATE hub_users SET name = $2 WHERE chat_id = $1', [chat_id, name]);
  }
  return rows.length;
}

export async function getUser(chatId) {
  await ensureAuthSchema();
  const { rows } = await pool.query(
    'SELECT chat_id::text, name, role, registered_at, approved_at FROM hub_users WHERE chat_id = $1',
    [chatId],
  );
  return rows[0] || null;
}

export async function upsertPending(chatId, name) {
  await ensureAuthSchema();
  await pool.query(
    `INSERT INTO hub_users (chat_id, name, role)
     VALUES ($1, $2, 'pending')
     ON CONFLICT (chat_id) DO NOTHING`,
    [chatId, name || null],
  );
}

export async function setRole(chatId, role, byChatId) {
  await ensureAuthSchema();
  const { rowCount } = await pool.query(
    `UPDATE hub_users
     SET role = $2,
         approved_at = CASE WHEN $2 = 'user' THEN COALESCE(approved_at, NOW()) ELSE approved_at END,
         approved_by = CASE WHEN $2 = 'user' THEN $3 ELSE approved_by END
     WHERE chat_id = $1`,
    [chatId, role, byChatId || null],
  );
  return rowCount > 0;
}

export async function listPending() {
  await ensureAuthSchema();
  const { rows } = await pool.query(
    "SELECT chat_id::text, name, registered_at FROM hub_users WHERE role = 'pending' ORDER BY registered_at DESC",
  );
  return rows;
}

export async function listAllUsers() {
  await ensureAuthSchema();
  const { rows } = await pool.query(`
    SELECT u.chat_id::text, u.name, u.role,
           COALESCE(array_agg(p.feature ORDER BY p.feature) FILTER (WHERE p.feature IS NOT NULL), '{}') AS features
    FROM hub_users u
    LEFT JOIN hub_permissions p ON p.chat_id = u.chat_id
    GROUP BY u.chat_id, u.name, u.role
    ORDER BY CASE u.role WHEN 'root' THEN 0 WHEN 'user' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
             u.registered_at DESC
  `);
  return rows;
}

export async function getRoots() {
  await ensureAuthSchema();
  const { rows } = await pool.query("SELECT chat_id::text FROM hub_users WHERE role = 'root'");
  return rows.map((r) => r.chat_id);
}

export async function getUsersWithFeature(feature) {
  await ensureAuthSchema();
  const { rows } = await pool.query(
    `SELECT DISTINCT u.chat_id::text
     FROM hub_users u
     LEFT JOIN hub_permissions p ON p.chat_id = u.chat_id AND p.feature = $1
     WHERE u.role = 'root' OR (u.role = 'user' AND p.feature IS NOT NULL)`,
    [feature],
  );
  return rows.map((r) => r.chat_id);
}

export async function hasPermission(chatId, feature) {
  const u = await getUser(chatId);
  if (!u) return false;
  if (u.role === 'root') return true;
  if (u.role !== 'user') return false;
  if (!feature) return true; // open command
  const { rowCount } = await pool.query(
    'SELECT 1 FROM hub_permissions WHERE chat_id = $1 AND feature = $2',
    [chatId, feature],
  );
  return rowCount > 0;
}

export async function grantPermission(chatId, feature, byChatId) {
  await ensureAuthSchema();
  const u = await getUser(chatId);
  if (!u || u.role === 'pending' || u.role === 'denied') return false;
  await pool.query(
    `INSERT INTO hub_permissions (chat_id, feature, granted_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (chat_id, feature) DO NOTHING`,
    [chatId, feature, byChatId || null],
  );
  return true;
}

export async function revokePermission(chatId, feature) {
  await ensureAuthSchema();
  const { rowCount } = await pool.query(
    'DELETE FROM hub_permissions WHERE chat_id = $1 AND feature = $2',
    [chatId, feature],
  );
  return rowCount > 0;
}
