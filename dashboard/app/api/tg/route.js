import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

const TG_HUB_URL = process.env.TELEGRAM_HUB_URL || 'http://telegram-hub:3000';

// 카테고리는 hub의 categories.js 와 동기화 (현재 'car' 만).
// 나중에 hub에 /categories 엔드포인트 추가하면 여기서 fetch 로 대체.
const CATEGORIES = [
  { key: 'car', label: '🚗 차', desc: '내 테슬라 상태/위치/충전' },
];

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

  // hub 자체가 안 떠 있으면 hub_users 테이블도 없을 수 있음 — try/catch.
  let users = [];
  let pending = [];
  let unmatched = [];
  let dbError = null;

  try {
    const usersQ = pool.query(`
      SELECT u.chat_id::text, u.name, u.role, u.registered_at, u.approved_at,
             COALESCE(array_agg(p.feature ORDER BY p.feature) FILTER (WHERE p.feature IS NOT NULL), '{}') AS features
      FROM hub_users u
      LEFT JOIN hub_permissions p ON p.chat_id = u.chat_id
      GROUP BY u.chat_id, u.name, u.role, u.registered_at, u.approved_at
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

  const hubHealth = await fetchHubHealth();

  return Response.json({
    hubHealth,
    users,
    pending,
    unmatched,
    categories: CATEGORIES,
    dbError,
  });
}
