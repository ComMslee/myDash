import { pool, getCarId } from './db.js';
import { sendMessage, sendLocation, escapeHtml } from './telegram.js';
import { formatKst } from './format.js';
import {
  ensureAuthSchema,
  getUser, upsertPending, setRole,
  listPending, getRoots,
  hasPermission,
} from './auth.js';
import { getCategories, categoryByKey, labelOf } from './categories.js';
import { listUserGroups, applyUserGroup } from './user_groups.js';

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
  // 운영 — 모바일에서 빠르게 처리할 최소 셋. 나머지(/users, /grant, /revoke,
  // /unmatched, /topnope, /resolve, /broadcast)는 /v2/tg 웹에서.
  '/pending':   { rootOnly: true, handler: cmdPending },
  '/setgroup':  { rootOnly: true, handler: cmdSetGroup },
  '/deny':      { rootOnly: true, handler: cmdDeny },
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

  // 매 메시지마다 텔레그램 first_name 으로 name 동기화 — placeholder/이름변경 케이스.
  const liveName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') || null;
  if (user && liveName && user.name !== liveName) {
    try {
      await pool.query('UPDATE hub_users SET name = $2 WHERE chat_id = $1', [chatId, liveName]);
      user.name = liveName;
    } catch (e) { console.error('[commands] name sync failed', e?.message); }
  }

  // 미등록 → pending 으로 등록 + root 알림.
  if (!user) {
    const name = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') || null;
    await upsertPending(chatId, name);
    await notifyRoots(
      [
        '🔔 <b>신규 가입 신청</b>',
        `#${chatId} ${escapeHtml(name || '(이름 없음)')}`,
        '',
        `적용: <code>/setgroup ${chatId} guest</code>`,
        `      <code>/setgroup ${chatId} root</code>`,
        `거부: <code>/deny ${chatId}</code>`,
      ].join('\n'),
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
        // 관리자 명령은 존재 자체를 숨김 — 알 수 없는 명령으로 폴백.
        return logAndPunt(chatId, t, head);
      }
      if (meta.feature && !(await hasPermission(chatId, meta.feature))) {
        // 권한 없는 feature 명령은 존재 숨김 — 오타와 구분 불가.
        return logAndPunt(chatId, t, head);
      }
    }
    return meta.handler({ chatId, args, user });
  }

  // 2) NL 패턴 — 권한 없는 feature 매칭은 존재 숨김 위해 조용히 폴스루.
  for (const p of NL_PATTERNS) {
    if (!p.re.test(t)) continue;
    if (p.feature && !(await hasPermission(chatId, p.feature))) continue;
    return p.handler({ chatId, args: '', user });
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
    const groups = await listUserGroups();
    const keys = groups.map((g) => g.key).join(' / ') || 'root / guest';
    lines.push('');
    lines.push('<b>관리자</b>');
    lines.push('/pending — 가입 대기자 보기');
    lines.push(`/setgroup &lt;chat_id&gt; &lt;group&gt; — 가입승인·그룹변경 (${keys})`);
    lines.push('/deny &lt;chat_id&gt; — 차단/탈퇴');
    lines.push('');
    lines.push('<i>권한·방송·로그 관리는 /v2/tg 웹에서</i>');
  }
  lines.push('');
  lines.push('<i>자연어 일부 지원</i> (예: "오늘 얼마나 달렸어?")');
  return sendMessage(lines.join('\n'), chatId);
}

async function cmdCategories({ chatId }) {
  // 권한 있는 카테고리만 노출 — 미보유 카테고리 존재는 숨김.
  const cats = await getCategories();
  const lines = ['<b>📂 카테고리</b>'];
  let shown = 0;
  for (const cat of cats) {
    if (!(await hasPermission(chatId, cat.key))) continue;
    lines.push(`✅ ${cat.label} — <i>${escapeHtml(cat.desc)}</i>`);
    shown++;
  }
  if (shown === 0) {
    lines.push('<i>이용 가능한 카테고리가 없어요. 관리자에게 권한을 요청하세요.</i>');
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
  const groups = await listUserGroups();
  const keys = groups.map((g) => g.key).join(' / ') || 'root / guest';
  const lines = ['<b>📋 가입 대기</b>'];
  for (const r of rows) {
    lines.push(`#${r.chat_id} · ${escapeHtml(r.name || '-')} · ${formatKst(r.registered_at)}`);
  }
  lines.push('');
  lines.push(`<i>적용: /setgroup &lt;chat_id&gt; &lt;group&gt; (${keys})</i>`);
  lines.push('<i>거부: /deny &lt;chat_id&gt;</i>');
  return sendMessage(lines.join('\n'), chatId);
}

async function cmdSetGroup({ chatId, args, user }) {
  const [target, groupKey] = (args || '').split(/\s+/);
  const groups = await listUserGroups();

  if (!/^\d+$/.test(target) || !groupKey) {
    const list = groups.length
      ? groups.map((g) => `  • <code>${g.key}</code> ${g.label}${g.is_root ? ' [root]' : ''}`).join('\n')
      : '  (없음)';
    return sendMessage(
      [
        '사용법: <code>/setgroup &lt;chat_id&gt; &lt;group&gt;</code>',
        '예: <code>/setgroup 1234567890 guest</code>',
        '',
        '사용 가능 그룹:',
        list,
      ].join('\n'),
      chatId,
    );
  }

  const r = await applyUserGroup(target, groupKey, user.chat_id);
  if (!r.ok) return sendMessage(`❌ ${r.error}`, chatId);
  const label = groups.find((g) => g.key === groupKey)?.label || groupKey;
  await sendMessage(`✅ #${target} → ${label} (role=${r.role})`, chatId);
  try {
    await sendMessage(`✅ '${label}' 그룹이 적용됐어요. /help 확인.`, target);
  } catch {}
}

async function cmdDeny({ chatId, args, user }) {
  const target = (args || '').split(/\s+/)[0];
  if (!/^\d+$/.test(target)) return sendMessage('사용법: /deny &lt;chat_id&gt;', chatId);
  const ok = await setRole(target, 'denied', user.chat_id);
  if (!ok) return sendMessage(`#${target} 없음`, chatId);
  return sendMessage(`🚫 #${target} 차단됨`, chatId);
}
