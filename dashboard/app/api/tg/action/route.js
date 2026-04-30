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
