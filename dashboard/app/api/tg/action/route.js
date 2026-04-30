import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';

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

function validateCategoryFields({ key, label, desc }, { requireKey = true } = {}) {
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
    case 'approve': {
      const chatId = String(body.chat_id || '');
      if (!/^\d+$/.test(chatId)) return bad('chat_id required');
      const { rowCount } = await pool.query(
        `UPDATE hub_users
         SET role='user', approved_at=COALESCE(approved_at, NOW())
         WHERE chat_id=$1`,
        [chatId],
      );
      if (!rowCount) return bad('not found', 404);
      notifyChat(chatId, '✅ 가입 승인됐습니다. /help 확인.');
      return Response.json({ ok: true });
    }
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
    case 'grant': {
      const chatId = String(body.chat_id || '');
      const feature = String(body.feature || '').trim();
      if (!/^\d+$/.test(chatId) || !feature) return bad('chat_id, feature required');
      const u = await pool.query('SELECT role FROM hub_users WHERE chat_id=$1', [chatId]);
      if (!u.rowCount) return bad('not found', 404);
      if (u.rows[0].role !== 'user' && u.rows[0].role !== 'root')
        return bad('user not approved');
      await pool.query(
        `INSERT INTO hub_permissions (chat_id, feature)
         VALUES ($1, $2)
         ON CONFLICT (chat_id, feature) DO NOTHING`,
        [chatId, feature],
      );
      notifyChat(chatId, `🎁 '${feature}' 권한이 부여됐어요. /help 확인.`);
      return Response.json({ ok: true });
    }
    case 'revoke': {
      const chatId = String(body.chat_id || '');
      const feature = String(body.feature || '').trim();
      if (!/^\d+$/.test(chatId) || !feature) return bad('chat_id, feature required');
      await pool.query(
        'DELETE FROM hub_permissions WHERE chat_id=$1 AND feature=$2',
        [chatId, feature],
      );
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
    case 'category_create': {
      const key = String(body.key || '').trim();
      const label = String(body.label || '').trim();
      const desc = String(body.desc || '').trim();
      const sortOrder = Number.isFinite(+body.sort_order) ? +body.sort_order : 0;
      const err = validateCategoryFields({ key, label, desc });
      if (err) return bad(err);
      try {
        await pool.query(
          `INSERT INTO hub_categories (key, label, description, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [key, label, desc, sortOrder],
        );
      } catch (e) {
        if (e?.code === '23505') return bad(`이미 존재하는 key: ${key}`, 409);
        if (e?.code === '42P01') return bad('hub_categories 테이블 없음 — hub 가 안 떴는지 확인', 503);
        return bad(e?.message || 'create failed', 500);
      }
      return Response.json({ ok: true });
    }
    case 'category_update': {
      const key = String(body.key || '').trim();
      const label = body.label != null ? String(body.label).trim() : null;
      const desc = body.desc != null ? String(body.desc).trim() : null;
      const sortOrder = Number.isFinite(+body.sort_order) ? +body.sort_order : null;
      if (!KEY_RE.test(key)) return bad('key 잘못됨');
      const err = validateCategoryFields({ key, label, desc });
      if (err) return bad(err);
      const sets = [];
      const vals = [key];
      if (label != null) { sets.push(`label = $${vals.length + 1}`); vals.push(label); }
      if (desc != null) { sets.push(`description = $${vals.length + 1}`); vals.push(desc); }
      if (sortOrder != null) { sets.push(`sort_order = $${vals.length + 1}`); vals.push(sortOrder); }
      if (!sets.length) return bad('변경할 필드 없음');
      const { rowCount } = await pool.query(
        `UPDATE hub_categories SET ${sets.join(', ')} WHERE key = $1`,
        vals,
      );
      if (!rowCount) return bad('not found', 404);
      return Response.json({ ok: true });
    }
    case 'category_delete': {
      const key = String(body.key || '').trim();
      if (!KEY_RE.test(key)) return bad('key 잘못됨');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // hub_permissions 에 FK 가 없어서 명시적으로 같이 정리.
        await client.query('DELETE FROM hub_permissions WHERE feature = $1', [key]);
        const { rowCount } = await client.query('DELETE FROM hub_categories WHERE key = $1', [key]);
        await client.query('COMMIT');
        if (!rowCount) return bad('not found', 404);
        return Response.json({ ok: true });
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        return bad(e?.message || 'delete failed', 500);
      } finally {
        client.release();
      }
    }
    case 'broadcast': {
      const text = String(body.text || '').trim();
      const target = String(body.target || 'all').trim(); // 'all' | feature key
      if (!text) return bad('text required');
      let recipients = [];
      if (target === 'all') {
        const r = await pool.query(
          "SELECT chat_id::text FROM hub_users WHERE role IN ('root','user')",
        );
        recipients = r.rows.map((x) => x.chat_id);
      } else {
        const r = await pool.query(
          `SELECT DISTINCT u.chat_id::text
           FROM hub_users u
           LEFT JOIN hub_permissions p ON p.chat_id=u.chat_id AND p.feature=$1
           WHERE u.role='root' OR (u.role='user' AND p.feature IS NOT NULL)`,
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
