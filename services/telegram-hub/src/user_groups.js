// 사용자 그룹 — dashboard 와 동일 스키마. 양쪽이 lazy create + idempotent.
// 시드(root, guest)도 양쪽에서 ON CONFLICT DO NOTHING 으로 안전.
// /setgroup 명령에서 사용.
import { pool } from './db.js';

let _schemaReady = false;

export async function ensureUserGroupsSchema() {
  if (_schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hub_user_groups (
      key         TEXT PRIMARY KEY,
      label       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      is_root     BOOLEAN NOT NULL DEFAULT false,
      is_default  BOOLEAN NOT NULL DEFAULT false,
      sort_order  INT NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS hub_user_group_features (
      group_key TEXT NOT NULL REFERENCES hub_user_groups(key) ON DELETE CASCADE,
      feature   TEXT NOT NULL,
      PRIMARY KEY (group_key, feature)
    );
  `);
  try {
    await pool.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS group_key TEXT`);
  } catch {}
  await pool.query(`
    INSERT INTO hub_user_groups (key, label, description, is_root, is_default, sort_order) VALUES
      ('root',  '👑 Root',  '전권 — 모든 기능',  true,  true, 0),
      ('guest', '👋 게스트', '공통 기능만',        false, true, 10)
    ON CONFLICT (key) DO NOTHING
  `);
  await pool.query(`
    INSERT INTO hub_user_group_features (group_key, feature) VALUES
      ('guest', 'common')
    ON CONFLICT DO NOTHING
  `);
  try {
    await pool.query(
      `UPDATE hub_users SET group_key = 'root' WHERE role = 'root' AND group_key IS NULL`,
    );
  } catch {}
  _schemaReady = true;
}

export async function listUserGroups() {
  await ensureUserGroupsSchema();
  const { rows } = await pool.query(
    `SELECT key, label, is_root FROM hub_user_groups ORDER BY sort_order, key`,
  );
  return rows;
}

export async function applyUserGroup(targetChatId, groupKey, byChatId) {
  await ensureUserGroupsSchema();
  const g = await pool.query(
    `SELECT key, is_root FROM hub_user_groups WHERE key = $1`, [groupKey],
  );
  if (!g.rowCount) return { ok: false, error: `group not found: ${groupKey}` };
  const isRoot = g.rows[0].is_root;
  const fr = await pool.query(
    `SELECT feature FROM hub_user_group_features WHERE group_key = $1`, [groupKey],
  );
  const features = fr.rows.map((r) => r.feature);
  const newRole = isRoot ? 'root' : 'user';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE hub_users
       SET role = $2,
           group_key = $3,
           approved_at = COALESCE(approved_at, NOW()),
           approved_by = COALESCE(approved_by, $4)
       WHERE chat_id = $1`,
      [targetChatId, newRole, groupKey, byChatId || null],
    );
    if (!upd.rowCount) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'user not found' };
    }
    await client.query('DELETE FROM hub_permissions WHERE chat_id = $1', [targetChatId]);
    if (!isRoot && features.length) {
      const ph = features.map((_, i) => `($1, $${i + 2})`).join(', ');
      await client.query(
        `INSERT INTO hub_permissions (chat_id, feature) VALUES ${ph}`,
        [targetChatId, ...features],
      );
    }
    await client.query('COMMIT');
    return { ok: true, role: newRole };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    return { ok: false, error: e.message };
  } finally {
    client.release();
  }
}
