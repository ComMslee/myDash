import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { ensureUserGroupsSchema } from '@/lib/tg-user-groups';

export const dynamic = 'force-dynamic';

const TG_HUB_URL = process.env.TELEGRAM_HUB_URL || 'http://telegram-hub:3000';

async function fetchHubHealth() {
  try {
    const r = await fetch(`${TG_HUB_URL}/health`, {
      signal: AbortSignal.timeout(1500),
      cache: 'no-store',
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    return await r.json();
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function GET() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;

  // user-group 스키마는 dashboard 가 관리. hub 안 떠 있으면 hub_users 에 ALTER 실패할 수 있어 try.
  try { await ensureUserGroupsSchema(); } catch {}

  let users = [];
  let pending = [];
  let unmatched = [];
  let categories = [];
  let userGroups = [];
  let dbError = null;

  try {
    const usersQ = pool.query(`
      SELECT u.chat_id::text, u.name, u.role, u.group_key, u.registered_at, u.approved_at,
             COALESCE(array_agg(p.feature ORDER BY p.feature) FILTER (WHERE p.feature IS NOT NULL), '{}') AS features
      FROM hub_users u
      LEFT JOIN hub_permissions p ON p.chat_id = u.chat_id
      GROUP BY u.chat_id, u.name, u.role, u.group_key, u.registered_at, u.approved_at
      ORDER BY CASE u.role WHEN 'root' THEN 0 WHEN 'user' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
               u.registered_at DESC
    `);
    const pendingQ = pool.query(
      "SELECT chat_id::text, name, registered_at FROM hub_users WHERE role = 'pending' ORDER BY registered_at DESC",
    );
    const unmatchedQ = pool.query(
      `SELECT id, ts, chat_id::text, text FROM hub_unmatched_inputs
       WHERE resolved = false ORDER BY ts DESC LIMIT 50`,
    );
    const [u, p, um] = await Promise.all([usersQ, pendingQ, unmatchedQ]);
    users = u.rows;
    pending = p.rows;
    unmatched = um.rows;
  } catch (e) {
    dbError = e?.message || String(e);
  }

  try {
    const { rows } = await pool.query(
      `SELECT key, label, description AS desc, sort_order
       FROM hub_categories ORDER BY sort_order, key`,
    );
    categories = rows;
  } catch { categories = []; }

  try {
    const { rows } = await pool.query(`
      SELECT g.key, g.label, g.description AS desc, g.is_root, g.is_default, g.sort_order,
             COALESCE(array_agg(f.feature ORDER BY f.feature) FILTER (WHERE f.feature IS NOT NULL), '{}') AS features
      FROM hub_user_groups g
      LEFT JOIN hub_user_group_features f ON f.group_key = g.key
      GROUP BY g.key, g.label, g.description, g.is_root, g.is_default, g.sort_order
      ORDER BY g.sort_order, g.key
    `);
    userGroups = rows;
  } catch { userGroups = []; }

  const hubHealth = await fetchHubHealth();

  return Response.json({
    hubHealth,
    users,
    pending,
    unmatched,
    categories,
    userGroups,
    dbError,
  });
}
