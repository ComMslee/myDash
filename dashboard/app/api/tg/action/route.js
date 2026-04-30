import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { applyUserGroup, ensureUserGroupsSchema } from '@/lib/tg-user-groups';

export const dynamic = 'force-dynamic';

const TG_HUB_URL = process.env.TELEGRAM_HUB_URL || 'http://telegram-hub:3000';
const HUB_SECRET = process.env.HUB_SHARED_SECRET || '';

async function notifyChat(chatId, text) {
  try {
    const headers = { 'content-type': 'application/json' };
    if (HUB_SECRET) headers.authorization = `Bearer ${HUB_SECRET}`;
    await fetch(`${TG_HUB_URL}/notify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (e) {
    console.error('[tg/action] notify failed', e?.message);
  }
}

function bad(msg, status = 400) {
  return Response.json({ ok: false, error: msg }, { status });
}

const KEY_RE = /^[a-z][a-z0-9_]{0,31}$/;

function validateGroupFields({ key, label, desc }, { requireKey = true } = {}) {
  if (requireKey) {
    if (!key || !KEY_RE.test(key)) return 'key: 영문 소문자/숫자/_ 1~32자 (첫 글자는 영문)';
  }
  if (label != null) {
    const s = String(label).trim();
    if (!s || s.length > 50) return 'label: 1~50자';
  }
  if (desc != null && String(desc).length > 200) return 'description: 200자 이하';
  return null;
}

export async function POST(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;

  let body;
  try { body = await req.json(); } catch { return bad('invalid json'); }
  const { action } = body || {};

  switch (action) {
    case 'deny': {
      const chatId = String(body.chat_id || '');
      if (!/^\d+$/.test(chatId)) return bad('chat_id required');
      const { rowCount } = await pool.query(
        `UPDATE hub_users SET role='denied' WHERE chat_id=$1`,
        [chatId],
      );
      if (!rowCount) return bad('not found', 404);
      return Response.json({ ok: true });
    }
    case 'resolve': {
      const ids = Array.isArray(body.ids) ? body.ids.filter((n) => Number.isFinite(+n)) : [];
      if (!ids.length) return bad('ids required');
      const { rowCount } = await pool.query(
        `UPDATE hub_unmatched_inputs
         SET resolved=true, resolved_at=NOW()
         WHERE id = ANY($1::int[]) AND resolved=false`,
        [ids],
      );
      return Response.json({ ok: true, count: rowCount });
    }
    case 'usergroup_apply': {
      const chatId = String(body.chat_id || '');
      const groupKey = String(body.group_key || '').trim();
      if (!/^\d+$/.test(chatId)) return bad('chat_id required');
      if (!KEY_RE.test(groupKey)) return bad('group_key 잘못됨');
      try {
        const r = await applyUserGroup(chatId, groupKey);
        const label = r.role === 'root' ? '👑 Root' : groupKey;
        notifyChat(chatId, `✅ '${label}' 그룹이 적용됐어요. /help 확인.`);
        return Response.json({ ok: true, role: r.role });
      } catch (e) {
        const msg = e?.message || 'apply failed';
        if (msg === 'user not found') return bad(msg, 404);
        return bad(msg, 500);
      }
    }
    case 'usergroup_create': {
      await ensureUserGroupsSchema();
      const key = String(body.key || '').trim();
      const label = String(body.label || '').trim();
      const desc = String(body.desc || '').trim();
      const sortOrder = Number.isFinite(+body.sort_order) ? +body.sort_order : 100;
      const features = Array.isArray(body.features)
        ? body.features.map((s) => String(s).trim()).filter(Boolean)
        : [];
      const err = validateGroupFields({ key, label, desc });
      if (err) return bad(err);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO hub_user_groups (key, label, description, is_root, is_default, sort_order)
           VALUES ($1, $2, $3, false, false, $4)`,
          [key, label, desc, sortOrder],
        );
        if (features.length) {
          const ph = features.map((_, i) => `($1, $${i + 2})`).join(', ');
          await client.query(
            `INSERT INTO hub_user_group_features (group_key, feature) VALUES ${ph}`,
            [key, ...features],
          );
        }
        await client.query('COMMIT');
        return Response.json({ ok: true });
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        if (e?.code === '23505') return bad(`이미 존재하는 key: ${key}`, 409);
        return bad(e?.message || 'create failed', 500);
      } finally {
        client.release();
      }
    }
    case 'usergroup_update': {
      const key = String(body.key || '').trim();
      if (!KEY_RE.test(key)) return bad('key 잘못됨');
      const g = await pool.query(
        `SELECT is_default FROM hub_user_groups WHERE key=$1`, [key],
      );
      if (!g.rowCount) return bad('not found', 404);
      if (g.rows[0].is_default) return bad('기본 그룹은 편집 불가', 403);

      const label = body.label != null ? String(body.label).trim() : null;
      const desc = body.desc != null ? String(body.desc).trim() : null;
      const sortOrder = Number.isFinite(+body.sort_order) ? +body.sort_order : null;
      const features = Array.isArray(body.features)
        ? body.features.map((s) => String(s).trim()).filter(Boolean)
        : null;
      const err = validateGroupFields({ key, label, desc });
      if (err) return bad(err);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const sets = [];
        const vals = [key];
        if (label != null) { sets.push(`label=$${vals.length + 1}`); vals.push(label); }
        if (desc != null) { sets.push(`description=$${vals.length + 1}`); vals.push(desc); }
        if (sortOrder != null) { sets.push(`sort_order=$${vals.length + 1}`); vals.push(sortOrder); }
        if (sets.length) {
          await client.query(
            `UPDATE hub_user_groups SET ${sets.join(', ')} WHERE key=$1`,
            vals,
          );
        }
        if (features != null) {
          await client.query('DELETE FROM hub_user_group_features WHERE group_key=$1', [key]);
          if (features.length) {
            const ph = features.map((_, i) => `($1, $${i + 2})`).join(', ');
            await client.query(
              `INSERT INTO hub_user_group_features (group_key, feature) VALUES ${ph}`,
              [key, ...features],
            );
          }
        }
        await client.query('COMMIT');
        return Response.json({ ok: true });
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        return bad(e?.message || 'update failed', 500);
      } finally {
        client.release();
      }
    }
    case 'usergroup_delete': {
      const key = String(body.key || '').trim();
      if (!KEY_RE.test(key)) return bad('key 잘못됨');
      const g = await pool.query(
        `SELECT is_default FROM hub_user_groups WHERE key=$1`, [key],
      );
      if (!g.rowCount) return bad('not found', 404);
      if (g.rows[0].is_default) return bad('기본 그룹은 삭제 불가', 403);
      // 멤버가 있으면 거부 — 그룹 변경 후 삭제하도록 강제.
      const m = await pool.query(
        `SELECT COUNT(*)::int AS n FROM hub_users WHERE group_key=$1`, [key],
      );
      if (m.rows[0].n > 0) {
        return bad(`멤버 ${m.rows[0].n}명 있음 — 다른 그룹으로 옮긴 후 삭제`, 409);
      }
      await pool.query('DELETE FROM hub_user_groups WHERE key=$1', [key]);
      return Response.json({ ok: true });
    }
    case 'broadcast': {
      const text = String(body.text || '').trim();
      const target = String(body.target || 'all').trim(); // 'all' | <user_group_key>
      if (!text) return bad('text required');
      let recipients = [];
      if (target === 'all') {
        const r = await pool.query(
          "SELECT chat_id::text FROM hub_users WHERE role IN ('root','user')",
        );
        recipients = r.rows.map((x) => x.chat_id);
      } else {
        if (!KEY_RE.test(target)) return bad('target 잘못됨');
        const r = await pool.query(
          `SELECT chat_id::text FROM hub_users
           WHERE group_key = $1 AND role IN ('root','user')`,
          [target],
        );
        recipients = r.rows.map((x) => x.chat_id);
      }
      for (const r of recipients) await notifyChat(r, text);
      return Response.json({ ok: true, sent: recipients.length });
    }
    default:
      return bad('unknown action');
  }
}
