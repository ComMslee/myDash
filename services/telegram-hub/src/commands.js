import { pool } from './db.js';
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
import { dashGet } from './dash.js';

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
  '/yesterday': { feature: 'car', handler: cmdYesterday },
  '/week':      { feature: 'car', handler: cmdWeek },
  '/range':     { feature: 'car', handler: cmdRange },
  '/parked':    { feature: 'car', handler: cmdParked },
  '/charge':    { feature: 'car', handler: cmdCharge },
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
  // /charge — 충전 진행 상세 (속도·경과·ETA). /soc 보다 먼저 매칭되어야 함.
  {
    feature: 'car',
    re: /(충전\s*(속도|진행|얼마나\s*(됐|남|걸려)|ETA|마저|언제.*끝)|언제\s*(끝|완료|다\s*돼)|얼마나.*충전(됐|돼|됨)|충전.*\bkw\b|\bkw\s*들어)/i,
    handler: cmdCharge,
  },
  // /range — 주행가능거리. /soc 보다 먼저 (남은 km/거리 선점).
  {
    feature: 'car',
    re: /(주행\s*가능|남은\s*(km|거리)|얼마나\s*갈|몇\s*km\s*남|주행거리|\brange\b)/i,
    handler: cmdRange,
  },
  // /soc — 배터리 % + 충전 중 여부 (단순). km/거리/충전속도는 위에서 처리됨.
  {
    feature: 'car',
    re: /(배터리|\bsoc\b|몇\s*[%％]|남은\s*(배터리|전기)|잔량|퍼센트|몇\s*프로|충전\s*(중|됐|됨)\??)/i,
    handler: cmdSoc,
  },
  // /yesterday — 어제 (KST). /today 보다 먼저.
  {
    feature: 'car',
    re: /(어제|어젯|yesterday)/i,
    handler: cmdYesterday,
  },
  // /week — 지난 7일.
  {
    feature: 'car',
    re: /(이번\s*주|지난\s*주|일주일|7일|주간|this\s*week|past\s*week|\bweek\b)/i,
    handler: cmdWeek,
  },
  // /today — 오늘 활동.
  {
    feature: 'car',
    re: /(오늘|today|얼마나.*(달렸|달려|달리|뛰었|뛰)|오늘.*(주행|충전|km|거리|효율)|운행\s*기록|일일\s*요약|오늘\s*뭐)/i,
    handler: cmdToday,
  },
  // /parked — 마지막 주차 장소·경과. /where 보다 먼저 (특수성).
  {
    feature: 'car',
    re: /(마지막\s*주차|주차한\s*지|얼마나\s*(세웠|세워)|세워둔\s*지|언제\s*주차|parked\s*(when|how))/i,
    handler: cmdParked,
  },
  // /where — 현재 위치 좌표/지도.
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
    { cmd: '/soc',       desc: '배터리 % + 충전 여부' },
    { cmd: '/range',     desc: '남은 주행거리' },
    { cmd: '/charge',    desc: '충전 진행 상세 (속도·경과)' },
    { cmd: '/today',     desc: '오늘 (KST) 주행/충전' },
    { cmd: '/yesterday', desc: '어제 (KST) 주행/충전' },
    { cmd: '/week',      desc: '지난 7일 요약' },
    { cmd: '/parked',    desc: '마지막 주차 장소·경과' },
    { cmd: '/where',     desc: '현재 위치' },
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
  // /api/car 와 /api/charging-status 병렬 — battery + 충전 진행 정보 결합.
  const [car, ch] = await Promise.all([
    dashGet('/api/car'),
    dashGet('/api/charging-status'),
  ]);
  if (!car || car.error) return sendMessage('데이터를 가져오지 못했어요', chatId);
  if (car.battery_level == null) return sendMessage('포지션 데이터 없음', chatId);

  const usable = car.usable_battery_level != null && car.usable_battery_level !== car.battery_level
    ? ` (사용가능 ${car.usable_battery_level}%)`
    : '';
  const lines = [`🔋 <b>${car.battery_level}%</b>${usable}`];
  if (ch?.charging) {
    const kwh = Number(ch.charge_energy_added || 0).toFixed(2);
    lines.push(`⚡ 충전 중 — 시작 ${formatKst(ch.start_date)} · ${kwh} kWh 추가됨`);
  } else {
    lines.push('충전 중 아님');
  }
  if (car.last_seen) lines.push(`<i>업데이트: ${formatKst(car.last_seen)} KST</i>`);
  return sendMessage(lines.join('\n'), chatId);
}

async function cmdToday({ chatId }) {
  const j = await dashGet('/api/summary?range=today');
  if (!j || j.error) return sendMessage('데이터를 가져오지 못했어요', chatId);
  const d = j.drives || {}; const c = j.charges || {};
  return sendMessage([
    '<b>오늘 (KST)</b>',
    d.n > 0 ? `🚗 ${d.n}회 주행 · ${Number(d.km).toFixed(1)} km · ${d.dur}분` : '🚗 주행 없음',
    c.n > 0 ? `⚡ ${c.n}회 충전 · ${Number(c.kwh).toFixed(2)} kWh` : '⚡ 충전 없음',
  ].join('\n'), chatId);
}

async function cmdWhere({ chatId }) {
  const j = await dashGet('/api/location');
  if (!j || j.error) return sendMessage('데이터를 가져오지 못했어요', chatId);
  if (j.lat == null) return sendMessage('위치 데이터 없음', chatId);

  const lat = Number(j.lat).toFixed(6);
  const lng = Number(j.lng).toFixed(6);
  const url = `https://maps.google.com/?q=${lat},${lng}`;
  await sendMessage(
    `📍 <a href="${url}">현재 위치 (${lat}, ${lng})</a>\n<i>업데이트: ${formatKst(j.date)} KST</i>`,
    chatId,
  );
  return sendLocation(j.lat, j.lng, chatId);
}

// 새 핸들러는 dashboard API 호출만 — TeslaMate DB 직접 쿼리는 dashboard 가 책임.
// 기존 /soc /today /where 도 같은 패턴으로 점진 마이그 (후속 PR).

function fmtElapsed(min) {
  if (!Number.isFinite(min) || min < 0) return '?';
  return min >= 60
    ? `${Math.floor(min / 60)}시간 ${min % 60}분`
    : `${min}분`;
}

async function cmdYesterday({ chatId }) {
  const j = await dashGet('/api/summary?range=yesterday');
  if (!j || j.error) return sendMessage('데이터를 가져오지 못했어요', chatId);
  const d = j.drives || {}; const c = j.charges || {};
  return sendMessage([
    '<b>어제 (KST)</b>',
    d.n > 0 ? `🚗 ${d.n}회 주행 · ${Number(d.km).toFixed(1)} km · ${d.dur}분` : '🚗 주행 없음',
    c.n > 0 ? `⚡ ${c.n}회 충전 · ${Number(c.kwh).toFixed(2)} kWh` : '⚡ 충전 없음',
  ].join('\n'), chatId);
}

async function cmdWeek({ chatId }) {
  const j = await dashGet('/api/summary?range=week');
  if (!j || j.error) return sendMessage('데이터를 가져오지 못했어요', chatId);
  const d = j.drives || {}; const c = j.charges || {};
  return sendMessage([
    '<b>지난 7일 (KST)</b>',
    d.n > 0 ? `🚗 ${d.n}회 · ${Number(d.km).toFixed(1)} km · ${d.dur}분` : '🚗 주행 없음',
    c.n > 0 ? `⚡ ${c.n}회 · ${Number(c.kwh).toFixed(2)} kWh` : '⚡ 충전 없음',
  ].join('\n'), chatId);
}

async function cmdRange({ chatId }) {
  const j = await dashGet('/api/car');
  if (!j || j.error) return sendMessage('데이터를 가져오지 못했어요', chatId);
  if (j.rated_battery_range == null) return sendMessage('주행거리 데이터 없음', chatId);
  const rated = j.rated_battery_range;
  const est = j.est_battery_range;
  const lines = [`🛣 <b>${rated} km</b> 남음 (${j.battery_level ?? '-'}%)`];
  if (est && est !== rated) lines.push(`<i>예상 ${est} km</i>`);
  if (j.last_seen) lines.push(`<i>업데이트: ${formatKst(j.last_seen)} KST</i>`);
  return sendMessage(lines.join('\n'), chatId);
}

async function cmdParked({ chatId }) {
  const j = await dashGet('/api/parked');
  if (!j || j.error) return sendMessage('데이터를 가져오지 못했어요', chatId);
  if (j.driving) {
    return sendMessage(`🚗 주행 중 — 시작 ${formatKst(j.drive_started_at)} KST`, chatId);
  }
  if (!j.parked) return sendMessage('주행 기록 없음', chatId);
  const p = j.parked;
  const place = p.place || '?';
  return sendMessage([
    `🅿️ <b>${escapeHtml(place)}</b>`,
    `정차: ${formatKst(p.end_date)} KST (${fmtElapsed(p.elapsed_min)} 전)`,
  ].join('\n'), chatId);
}

async function cmdCharge({ chatId }) {
  const j = await dashGet('/api/charging-status');
  if (!j || j.error) return sendMessage('데이터를 가져오지 못했어요', chatId);

  if (!j.charging) {
    // 충전 기록 자체는 /api/car last_charge 로.
    const car = await dashGet('/api/car');
    const last = car?.last_charge;
    if (!last) return sendMessage('⚡ 현재 충전 중 아님 — 충전 기록 없음', chatId);
    return sendMessage([
      '⚡ 현재 충전 중 아님',
      `<i>마지막: ${formatKst(last.end_date)} KST · ${last.soc_start ?? '?'}% → ${last.soc_end ?? '?'}%</i>`,
    ].join('\n'), chatId);
  }

  const power = j.charger_power != null ? Number(j.charger_power).toFixed(1) : null;
  const kwh = Number(j.charge_energy_added || 0).toFixed(2);
  const startSoc = j.start_battery_level ?? '?';
  const curSoc = j.battery_level ?? '?';
  const elapsedMin = j.start_date
    ? Math.floor((Date.now() - new Date(j.start_date).getTime()) / 60000)
    : null;
  const lines = [
    '⚡ <b>충전 중</b>' + (j.fallback ? ' <i>(폴백 감지)</i>' : ''),
    `🔋 ${startSoc}% → <b>${curSoc}%</b>`,
    `📥 ${kwh} kWh${power ? ` · 현재 ${power} kW` : ''}`,
  ];
  if (j.start_date) lines.push(`⏱ 시작 ${formatKst(j.start_date)} KST (${fmtElapsed(elapsedMin)} 경과)`);
  return sendMessage(lines.join('\n'), chatId);
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
