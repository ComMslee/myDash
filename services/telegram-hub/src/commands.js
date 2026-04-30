import { pool, getCarId } from './db.js';
import { sendMessage, sendLocation, escapeHtml } from './telegram.js';
import { formatKst } from './format.js';
import {
  ensureAuthSchema,
  getUser, upsertPending, setRole,
  listPending, listAllUsers, getRoots,
  hasPermission, grantPermission, revokePermission,
} from './auth.js';
import { getCategories, categoryByKey, labelOf } from './categories.js';

// ── 명령 카탈로그 ─────────────────────────────────────
// open: 누구나 (등록 안 된 사람도 가능)
// rootOnly: root 만
// feature: 'car' / 'sns' 등 — user 는 해당 권한 보유 시만
const COMMANDS = {
  '/help':      { open: true,     handler: cmdHelp },
  '/start':     { open: true,     handler: cmdStart },
  '/whoami':    { open: true,     handler: cmdWhoami },
  '/categories':{ open: true,     handler: cmdCategories },
  '/soc':       { feature: 'car', handler: cmdSoc },
  '/today':     { feature: 'car', handler: cmdToday },
  '/where':     { feature: 'car', handler: cmdWhere },
  // 운영
  '/pending':   { rootOnly: true, handler: cmdPending },
  '/approve':   { rootOnly: true, handler: cmdApprove },
  '/deny':      { rootOnly: true, handler: cmdDeny },
  '/grant':     { rootOnly: true, handler: cmdGrant },
  '/revoke':    { rootOnly: true, handler: cmdRevoke },
  '/users':     { rootOnly: true, handler: cmdUsers },
  '/unmatched': { rootOnly: true, handler: cmdUnmatched },
  '/topnope':   { rootOnly: true, handler: cmdTopNope },
  '/resolve':   { rootOnly: true, handler: cmdResolve },
};

// ── 자연어 라우팅 (feature 태그 포함) ─────────────────
// 첫 매칭 승. 위에서 아래로 검사. 의도가 모호한 표현은 더 명확한 패턴이 위로.
const NL_PATTERNS = [
  // /soc — 배터리/충전 상태
  {
    feature: 'car',
    re: /(배터리|soc|몇\s*[%％]|얼마나.*(남|차)|남은\s*(배터리|km|거리|전기)|잔량|퍼센트|충전중|충전\s*(상태|됐|됨|끝|중\?)|지금.*충전|몇\s*프로)/i,
    handler: cmdSoc,
  },
  // /today — 오늘 활동
  {
    feature: 'car',
    re: /(오늘|today|얼마나.*(달렸|달려|달리|뛰었|뛰)|오늘.*(주행|충전|km|거리|효율)|운행\s*기록|일일\s*요약|오늘\s*뭐|일주.*기록)/i,
    handler: cmdToday,
  },
  // /where — 현재 위치
  {
    feature: 'car',
    re: /(어디|위치|where.*(car|는|있)|지도|location|어디야|어디에|주차.*어디|차.*어디|내\s*차|현재\s*위치|navigate|map.*me)/i,
    handler: cmdWhere,
  },
  // open: /help
  {
    feature: null,
    re: /(도움말|help\b|뭐\s*할\s*수|어떻게.*(써|사용)|명령.*뭐|기능.*뭐|쓸\s*수\s*있|할\s*수\s*있는|뭐가\s*돼)/i,
    handler: cmdHelp,
  },
  // open: /whoami
  {
    feature: null,
    re: /(내\s*권한|내\s*역할|나는\s*누구|whoami|내\s*정보|내\s*chat)/i,
    handler: cmdWhoami,
  },
  // open: /categories
  {
    feature: null,
    re: /(카테고리|categor|메뉴\s*보|기능\s*목록)/i,
    handler: cmdCategories,
  },
];

// hub_unmatched_inputs 스키마.
let _unmatchedSchemaReady = false;
async function ensureUnmatchedSchema() {
  if (_unmatchedSchemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hub_unmatched_inputs (
      id               SERIAL PRIMARY KEY,
      ts               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      chat_id          BIGINT NOT NULL,
      text             TEXT NOT NULL,
      resolved         BOOLEAN NOT NULL DEFAULT false,
      resolved_pattern TEXT,
      resolved_at      TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_hub_unmatched_resolved_ts
      ON hub_unmatched_inputs (resolved, ts DESC);
  `);
  _unmatchedSchemaReady = true;
}

// ── 진입점 ────────────────────────────────────────────
export async function handleMessage(message) {
  const chatId = String(message.chat?.id);
  const text = message.text || '';
  if (!chatId || !text) return;

  await ensureAuthSchema();
  let user = await getUser(chatId);

  // 미등록 → pending 으로 등록 + root 알림.
  if (!user) {
    const name = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') || null;
    await upsertPending(chatId, name);
    await notifyRoots(
      `🔔 신규 가입 신청\n#${chatId} ${escapeHtml(name || '(이름 없음)')}\n승인: <code>/approve ${chatId}</code>`,
    );
    return sendMessage(
      '👋 가입 신청이 접수됐습니다.\n관리자 승인 후 사용 가능해요.',
      chatId,
    );
  }
  if (user.role === 'denied') return; // silent
  if (user.role === 'pending') {
    return sendMessage('⏳ 아직 승인 대기 중입니다. 관리자가 승인하면 알려드릴게요.', chatId);
  }

  const t = text.trim();

  // 1) /cmd
  if (t.startsWith('/')) {
    const head = t.split(/\s+/)[0].toLowerCase().split('@')[0];
    const args = t.slice(head.length).trim();
    const meta = COMMANDS[head];
    if (!meta) return logAndPunt(chatId, t, head);

    if (!meta.open) {
      if (meta.rootOnly && user.role !== 'root') {
        return sendMessage('🔒 관리자 전용 명령입니다.', chatId);
      }
      if (meta.feature && !(await hasPermission(chatId, meta.feature))) {
        return sendMessage(`🔒 이 명령은 '${meta.feature}' 권한이 필요해요.\n관리자에게 요청하세요.`, chatId);
      }
    }
    return meta.handler({ chatId, args, user });
  }

  // 2) NL 패턴
  for (const p of NL_PATTERNS) {
    if (p.re.test(t)) {
      if (p.feature && !(await hasPermission(chatId, p.feature))) {
        return sendMessage(`🔒 '${p.feature}' 권한이 필요해요.`, chatId);
      }
      return p.handler({ chatId, args: '', user });
    }
  }

  // 3) 미해결 — 로그 + 폴백
  return logAndPunt(chatId, t, null);
}

async function notifyRoots(text) {
  const roots = await getRoots();
  for (const r of roots) {
    try { await sendMessage(text, r); } catch (e) { console.error('[notify root]', e.message); }
  }
}

async function logAndPunt(chatId, text, slashHead) {
  try {
    await ensureUnmatchedSchema();
    await pool.query(
      `INSERT INTO hub_unmatched_inputs (chat_id, text) VALUES ($1, $2)`,
      [chatId, text],
    );
  } catch (e) {
    console.error('[commands] unmatched log failed', e.message);
  }
  const head = slashHead
    ? `알 수 없는 명령: ${escapeHtml(slashHead)}`
    : '잘 모르겠어요.';
  return sendMessage(`${head}\n/help 보기`, chatId);
}

// ── 핸들러 ────────────────────────────────────────────

async function cmdStart({ chatId }) {
  return cmdHelp({ chatId });
}

// 카테고리별 명령 카탈로그 — /help 표시용.
const CATEGORY_COMMANDS = {
  car: [
    { cmd: '/soc',   desc: '배터리 % + 충전 여부' },
    { cmd: '/today', desc: '오늘 (KST) 주행/충전' },
    { cmd: '/where', desc: '현재 위치' },
  ],
  // 새 카테고리 추가 시 여기에 명령 목록.
};

async function cmdHelp({ chatId, user }) {
  const u = user || await getUser(chatId);
  const isRoot = u?.role === 'root';
  const cats = await getCategories();
  const lines = ['<b>Ye\'s Home 봇</b>', ''];

  // 본인이 가진 카테고리만 표시
  for (const cat of cats) {
    if (!(await hasPermission(chatId, cat.key))) continue;
    const cmds = CATEGORY_COMMANDS[cat.key] || [];
    if (!cmds.length) continue;
    lines.push(`<b>${cat.label}</b>`);
    for (const c of cmds) lines.push(`${c.cmd} — ${c.desc}`);
    lines.push('');
  }

  lines.push('<b>공통</b>');
  lines.push('/whoami — 내 권한');
  lines.push('/categories — 전체 카테고리');
  lines.push('/help — 이 도움말');

  if (isRoot) {
    lines.push('');
    lines.push('<b>관리자</b>');
    lines.push('/pending /approve /deny /grant /revoke /users');
    lines.push('/unmatched /topnope /resolve');
  }
  lines.push('');
  lines.push('<i>자연어 일부 지원</i> (예: "오늘 얼마나 달렸어?")');
  return sendMessage(lines.join('\n'), chatId);
}

async function cmdCategories({ chatId }) {
  const cats = await getCategories();
  const lines = ['<b>📂 카테고리</b>'];
  for (const cat of cats) {
    const have = await hasPermission(chatId, cat.key);
    lines.push(`${have ? '✅' : '⬜'} ${cat.label} — <i>${escapeHtml(cat.desc)}</i>`);
  }
  if (cats.length === 0) {
    lines.push('<i>등록된 카테고리 없음</i>');
  }
  return sendMessage(lines.join('\n'), chatId);
}

async function cmdWhoami({ chatId, user }) {
  const u = user || await getUser(chatId);
  if (!u) return sendMessage('등록 안 됨', chatId);
  await getCategories(); // warm cache for sync labelOf
  const { rows } = await pool.query(
    "SELECT feature FROM hub_permissions WHERE chat_id = $1 ORDER BY feature",
    [chatId],
  );
  const feats = rows.map((r) => labelOf(r.feature)).join(' ') || '없음';
  return sendMessage([
    `<b>내 정보</b>`,
    `chat_id: <code>${chatId}</code>`,
    `이름: ${escapeHtml(u.name || '-')}`,
    `역할: ${u.role}`,
    `권한: ${feats}`,
  ].join('\n'), chatId);
}

async function cmdSoc({ chatId }) {
  const carId = await getCarId();
  if (!carId) return sendMessage('차량 정보 없음', chatId);

  const { rows } = await pool.query(
    `SELECT battery_level, usable_battery_level, date
     FROM positions WHERE car_id = $1 ORDER BY date DESC LIMIT 1`,
    [carId],
  );
  const p = rows[0];
  if (!p) return sendMessage('포지션 데이터 없음', chatId);

  const { rows: chRows } = await pool.query(
    `SELECT id, start_date, charge_energy_added
     FROM charging_processes
     WHERE car_id = $1 AND end_date IS NULL
     ORDER BY id DESC LIMIT 1`,
    [carId],
  );
  const ch = chRows[0];

  const lines = [];
  const useable = p.usable_battery_level != null && p.usable_battery_level !== p.battery_level
    ? ` (사용가능 ${p.usable_battery_level}%)`
    : '';
  lines.push(`🔋 <b>${p.battery_level}%</b>${useable}`);
  if (ch) {
    const kwh = Number(ch.charge_energy_added || 0).toFixed(2);
    lines.push(`⚡ 충전 중 — 시작 ${formatKst(ch.start_date)} · ${kwh} kWh 추가됨`);
  } else {
    lines.push('충전 중 아님');
  }
  lines.push(`<i>업데이트: ${formatKst(p.date)} KST</i>`);
  return sendMessage(lines.join('\n'), chatId);
}

async function cmdToday({ chatId }) {
  const carId = await getCarId();
  if (!carId) return sendMessage('차량 정보 없음', chatId);

  const KST_OFFSET_MS = 9 * 3600 * 1000;
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  const todayStart = new Date(Date.UTC(
    nowKst.getUTCFullYear(),
    nowKst.getUTCMonth(),
    nowKst.getUTCDate(),
  ) - KST_OFFSET_MS);

  const { rows: dr } = await pool.query(
    `SELECT COUNT(*)::int AS n,
            COALESCE(SUM(distance), 0)::float AS km,
            COALESCE(SUM(duration_min), 0)::int AS dur
     FROM drives
     WHERE car_id = $1 AND start_date >= $2`,
    [carId, todayStart],
  );
  const { rows: ch } = await pool.query(
    `SELECT COUNT(*)::int AS n,
            COALESCE(SUM(charge_energy_added), 0)::float AS kwh
     FROM charging_processes
     WHERE car_id = $1 AND start_date >= $2`,
    [carId, todayStart],
  );
  const d = dr[0];
  const c = ch[0];
  const lines = [
    '<b>오늘 (KST)</b>',
    d.n > 0 ? `🚗 ${d.n}회 주행 · ${d.km.toFixed(1)} km · ${d.dur}분` : '🚗 주행 없음',
    c.n > 0 ? `⚡ ${c.n}회 충전 · ${c.kwh.toFixed(2)} kWh` : '⚡ 충전 없음',
  ];
  return sendMessage(lines.join('\n'), chatId);
}

async function cmdWhere({ chatId }) {
  const carId = await getCarId();
  if (!carId) return sendMessage('차량 정보 없음', chatId);

  const { rows } = await pool.query(
    `SELECT latitude::float AS lat, longitude::float AS lng, date
     FROM positions WHERE car_id = $1 ORDER BY date DESC LIMIT 1`,
    [carId],
  );
  const p = rows[0];
  if (!p) return sendMessage('위치 데이터 없음', chatId);

  const lat = p.lat.toFixed(6);
  const lng = p.lng.toFixed(6);
  const url = `https://maps.google.com/?q=${lat},${lng}`;
  await sendMessage(
    `📍 <a href="${url}">현재 위치 (${lat}, ${lng})</a>\n<i>업데이트: ${formatKst(p.date)} KST</i>`,
    chatId,
  );
  return sendLocation(p.lat, p.lng, chatId);
}

// ── 운영 명령 (root) ─────────────────────────────────

async function cmdPending({ chatId }) {
  const rows = await listPending();
  if (!rows.length) return sendMessage('가입 대기 없음 ✨', chatId);
  const lines = ['<b>📋 가입 대기</b>'];
  for (const r of rows) {
    lines.push(`#${r.chat_id} · ${escapeHtml(r.name || '-')} · ${formatKst(r.registered_at)}`);
  }
  lines.push('');
  lines.push('<i>승인: /approve &lt;chat_id&gt;</i>');
  lines.push('<i>거부: /deny &lt;chat_id&gt;</i>');
  return sendMessage(lines.join('\n'), chatId);
}

async function cmdApprove({ chatId, args, user }) {
  const target = (args || '').split(/\s+/)[0];
  if (!/^\d+$/.test(target)) return sendMessage('사용법: /approve <chat_id>', chatId);
  const ok = await setRole(target, 'user', user.chat_id);
  if (!ok) return sendMessage(`#${target} 없음`, chatId);
  await sendMessage(`✅ #${target} 승인 완료. 권한 부여: <code>/grant ${target} car</code>`, chatId);
  // 당사자에게 알림
  try {
    await sendMessage('✅ 가입 승인됐습니다. 관리자가 권한을 추가할 때까지 일부 명령은 막혀 있을 수 있어요.\n/help 로 사용 가능 확인.', target);
  } catch {}
}

async function cmdDeny({ chatId, args, user }) {
  const target = (args || '').split(/\s+/)[0];
  if (!/^\d+$/.test(target)) return sendMessage('사용법: /deny <chat_id>', chatId);
  const ok = await setRole(target, 'denied', user.chat_id);
  if (!ok) return sendMessage(`#${target} 없음`, chatId);
  return sendMessage(`🚫 #${target} 거부됨`, chatId);
}

async function cmdGrant({ chatId, args, user }) {
  const [target, feature] = (args || '').split(/\s+/);
  const cats = await getCategories();
  if (!/^\d+$/.test(target) || !feature) {
    const known = cats.map((c) => c.key).join(', ') || '(없음)';
    return sendMessage(`사용법: /grant <chat_id> <feature>\n예: /grant 1234567890 car\n등록된 카테고리: ${known}`, chatId);
  }
  const known = !!categoryByKey(feature);
  const ok = await grantPermission(target, feature, user.chat_id);
  if (!ok) return sendMessage(`#${target} 없거나 승인 안 됨`, chatId);
  const labelStr = known ? labelOf(feature) : `${feature} <i>(미등록 카테고리)</i>`;
  await sendMessage(`✅ #${target} 에게 ${labelStr} 권한 부여`, chatId);
  try {
    await sendMessage(`🎁 ${labelStr} 권한이 부여됐어요. /help 확인.`, target);
  } catch {}
}

async function cmdRevoke({ chatId, args }) {
  const [target, feature] = (args || '').split(/\s+/);
  if (!/^\d+$/.test(target) || !feature) {
    return sendMessage('사용법: /revoke <chat_id> <feature>', chatId);
  }
  const ok = await revokePermission(target, feature);
  return sendMessage(ok ? `🗑 #${target} '${feature}' 회수` : '권한 없음', chatId);
}

async function cmdUsers({ chatId }) {
  await getCategories(); // warm cache for sync labelOf
  const rows = await listAllUsers();
  if (!rows.length) return sendMessage('사용자 없음', chatId);
  const lines = ['<b>👥 사용자</b>'];
  for (const r of rows) {
    const feats = r.features.length ? r.features.map(labelOf).join(' ') : '-';
    lines.push(`[${r.role}] #${r.chat_id} ${escapeHtml(r.name || '-')} · ${feats}`);
  }
  return sendMessage(lines.join('\n'), chatId);
}

async function cmdUnmatched({ chatId }) {
  await ensureUnmatchedSchema();
  const { rows } = await pool.query(
    `SELECT id, ts, text, chat_id::text FROM hub_unmatched_inputs
     WHERE resolved = false
     ORDER BY ts DESC LIMIT 20`,
  );
  if (!rows.length) return sendMessage('미해결 입력 없음 ✨', chatId);
  const lines = ['<b>📋 미해결 (최근 20)</b>'];
  for (const r of rows) {
    lines.push(`#${r.id} · ${formatKst(r.ts)} · #${r.chat_id} · ${escapeHtml(r.text).slice(0, 60)}`);
  }
  lines.push('');
  lines.push('<i>패턴 추가 후 /resolve 1,2,3</i>');
  return sendMessage(lines.join('\n'), chatId);
}

async function cmdTopNope({ chatId }) {
  await ensureUnmatchedSchema();
  const { rows } = await pool.query(
    `SELECT lower(trim(text)) AS norm, COUNT(*)::int AS n
     FROM hub_unmatched_inputs
     WHERE resolved = false
     GROUP BY norm
     ORDER BY n DESC, MAX(ts) DESC
     LIMIT 5`,
  );
  if (!rows.length) return sendMessage('미해결 입력 없음 ✨', chatId);
  const lines = ['<b>🔝 자주 못 알아들은 표현 TOP 5</b>'];
  for (const r of rows) {
    lines.push(`× ${r.n}  ${escapeHtml(r.norm).slice(0, 60)}`);
  }
  return sendMessage(lines.join('\n'), chatId);
}

async function cmdResolve({ chatId, args }) {
  await ensureUnmatchedSchema();
  const ids = String(args || '')
    .split(/[\s,]+/)
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!ids.length) return sendMessage('사용법: /resolve 1,2,3', chatId);
  const { rowCount } = await pool.query(
    `UPDATE hub_unmatched_inputs
     SET resolved=true, resolved_at=NOW()
     WHERE id = ANY($1::int[]) AND resolved = false`,
    [ids],
  );
  return sendMessage(`✅ ${rowCount}건 해결 처리`, chatId);
}
