// 사용자 그룹(user group) 스키마 — dashboard 가 단일 소스.
// 기능 그룹(hub_categories) 과는 별개 레이어:
//   - 기능 그룹: 코드(categories.js) 시드만, UI 에서 추가 불가
//   - 사용자 그룹: /v2/tg 에서 CRUD, 단 기본(root/guest) 는 편집/삭제 불가
//   - 사용자 그룹은 어떤 기능 그룹들을 포함할지 결정 (hub_user_group_features)
//   - 사용자에게 그룹 적용 시 role + hub_permissions 일괄 갱신
import pool from './db.js';

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
  // hub_users 가 먼저 있어야 ALTER 가능. 없으면 hub 가 부팅 안 된 상태 — 무시.
  try {
    await pool.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS group_key TEXT`);
  } catch {}

  // 기본 그룹 시드 — root, guest. 이미 있으면 보존.
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

  // 기존 role='root' 사용자(env 부트스트랩 등)에 group_key='root' 자동 매핑.
  try {
    await pool.query(
      `UPDATE hub_users SET group_key = 'root' WHERE role = 'root' AND group_key IS NULL`,
    );
  } catch {}

  _schemaReady = true;
}

// 사용자에게 그룹 적용 — 트랜잭션으로 role + hub_permissions 일괄 갱신.
// is_root=true 그룹은 role='root' 로 설정하고 perms 삽입은 생략(코드에서 bypass).
export async function applyUserGroup(chatId, groupKey) {
  await ensureUserGroupsSchema();
  const g = await pool.query(
    `SELECT key, is_root FROM hub_user_groups WHERE key = $1`,
    [groupKey],
  );
  if (!g.rowCount) throw new Error(`group not found: ${groupKey}`);
  const isRoot = g.rows[0].is_root;

  const fr = await pool.query(
    `SELECT feature FROM hub_user_group_features WHERE group_key = $1`,
    [groupKey],
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
           approved_at = COALESCE(approved_at, NOW())
       WHERE chat_id = $1`,
      [chatId, newRole, groupKey],
    );
    if (!upd.rowCount) {
      await client.query('ROLLBACK');
      throw new Error('user not found');
    }
    await client.query('DELETE FROM hub_permissions WHERE chat_id = $1', [chatId]);
    if (!isRoot && features.length) {
      const placeholders = features.map((_, i) => `($1, $${i + 2})`).join(', ');
      await client.query(
        `INSERT INTO hub_permissions (chat_id, feature) VALUES ${placeholders}`,
        [chatId, ...features],
      );
    }
    await client.query('COMMIT');
    return { role: newRole, features: isRoot ? '*' : features };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
