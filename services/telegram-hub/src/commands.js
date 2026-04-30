import { pool } from './db.js';
import {
  sendMessage, sendLocation, escapeHtml,
  deleteMyCommands, answerCallbackQuery, editMessageText,
} from './telegram.js';
import { formatKst } from './format.js';
import {
  ensureAuthSchema,
  getUser, upsertPending, setRole,
  listPending, getRoots,
  hasPermission,
} from './auth.js';
import { getCategories, categoryByKey, labelOf } from './categories.js';
import { listUserGroups, applyUserGroup } from './user_groups.js';
import { dashGet, dashPost } from './dash.js';
import { setPending, getPending, clearPending } from './pending.js';

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
  '/charge':    { feature: 'car', handler: cmdSoc },        // alias — /soc 응답에 충전 상세 통합.
  '/range':     { feature: 'car', handler: cmdSoc },        // alias — /soc 응답에 거리 통합.
  '/battery':   { feature: 'car', handler: cmdSoc },        // alias.
  '/today':     { feature: 'car', handler: cmdPeriod },     // alias — /period 안에 오늘 포함.
  '/yesterday': { feature: 'car', handler: cmdPeriod },     // alias — 옛 슬래시 호환.
  '/week':      { feature: 'car', handler: cmdPeriod },     // alias.
  '/summary':   { feature: 'car', handler: cmdPeriod },     // alias.
  '/period':    { feature: 'car', handler: cmdPeriod },
  '/parked':    { feature: 'car', handler: cmdWhere },      // alias — /where 와 통합.
  '/where':     { feature: 'car', handler: cmdWhere },
  '/chargers':  { feature: 'car', handler: cmdChargers },
  '/places':    { feature: 'car', handler: cmdPlaces },
  // family — mock. 인터페이스 검증용 placeholder.
  '/weather':   { feature: 'family', handler: cmdWeather },
  '/forecast':  { feature: 'family', handler: cmdForecast },
  '/event':     { feature: 'family', handler: cmdEvent },
  '/memo':      { feature: 'family', handler: cmdMemo },
  // sns — 현재는 dashboard 까지 전달되는지 확인용 mock. 실제 발행 X.
  '/post':      { feature: 'sns', handler: cmdPost },
  // 운영 — 모바일에서 빠르게 처리할 최소 셋. 나머지(/users, /grant, /revoke,
  // /unmatched, /topnope, /resolve, /broadcast)는 /v2/tg 웹에서.
  '/pending':   { rootOnly: true, handler: cmdPending },
  '/setgroup':  { rootOnly: true, handler: cmdSetGroup },
  '/deny':      { rootOnly: true, handler: cmdDeny },
};

// hub_unmatched_inputs 스키마.
// 자연어 라우팅은 미지원 — 슬래시 외 입력은 모두 여기 적재돼 추후 분석/재도입 자료가 됨.
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
  // 텍스트 없는 메시지(사진/문서/스티커 등) 도 일단 받음 — 다단계 입력에서
  // 본문 사진 첨부 케이스를 처리해야 하므로. text 비어있으면 caption 으로 폴백.
  const text = message.text || message.caption || '';
  const hasPhoto = Array.isArray(message.photo) && message.photo.length > 0;
  if (!chatId || (!text && !hasPhoto)) return;

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
      [
        '👋 안녕하세요! 가입 신청이 접수됐어요.',
        '',
        '관리자가 승인하면 알림을 드릴게요.',
        '잠시만 기다려 주세요 🙏',
      ].join('\n'),
      chatId,
    );
  }
  if (user.role === 'denied') return; // silent
  if (user.role === 'pending') {
    return sendMessage('⏳ 아직 승인 대기 중입니다. 관리자가 승인하면 알려드릴게요.', chatId);
  }

  // 0) 다단계 대화 진행 중인지 — pending 액션 우선 처리.
  //    텍스트/사진/사진+캡션 모두 받음.
  const pending = getPending(chatId);
  if (pending) {
    const handled = await handlePendingMessage(chatId, message, pending, user);
    if (handled) return;
  }

  let t = text.trim();

  // 1a) ⬅️ 메인 — 메인 키보드로 복귀.
  if (t === NAV_HOME) {
    const kb = await buildMainKeyboard(chatId);
    return sendMessage(
      '메인 메뉴로 돌아왔어요. 카테고리를 선택하세요.',
      chatId,
      kb ? { reply_markup: kb } : {},
    );
  }

  // 1b) 카테고리 라벨 (예: '🚗 차량') → sub-keyboard 로 갈아끼움.
  const navCat = await categoryByLabel(t);
  if (navCat) {
    if (!(await hasPermission(chatId, navCat))) {
      return sendMessage('🔒 이 카테고리는 권한이 없어요.\n관리자에게 요청해 주세요.', chatId);
    }
    const kb = buildSubKeyboard(navCat);
    const cat = (await getCategories()).find((c) => c.key === navCat);
    return sendMessage(
      `<b>${escapeHtml(cat?.label || t)}</b> 메뉴 — 원하는 항목을 선택하세요.`,
      chatId,
      kb ? { reply_markup: kb } : {},
    );
  }

  // 1c) Reply 키보드 한글 버튼 → 슬래시 치환. 정확 일치만.
  if (BUTTON_TO_CMD[t]) t = BUTTON_TO_CMD[t];

  // 1d) /cmd
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
        // 가족 봇 톤 — 보안 숨김 X, 권한 부재를 명시적으로 안내.
        return sendMessage(
          `🔒 이 기능은 아직 권한이 없어요.\n관리자에게 요청해 주세요.`,
          chatId,
        );
      }
    }
    return meta.handler({ chatId, args, user });
  }

  // 2) 슬래시 외 입력 — 미해결 로그 + 폴백.
  return logAndPunt(chatId, t, null);
}

// ── callback_query 라우터 ─────────────────────────────
// inline 키보드 버튼 클릭 → 라우팅. 현재는 'cmd:<name>' 형태만 — 같은 명령 새로 실행 (=
// "새로고침" 또는 인접 명령 단축). 응답은 새 메시지로 보냄(stateless).
// 향후 SNS 등 다단계 대화는 'sns:tw', 'post:confirm' 같은 prefix 로 확장.
const CB_ROUTES = {
  soc: cmdSoc,                       // /charge /range /battery 모두 alias.
  period: cmdPeriod,                 // /today /yesterday /week 모두 alias.
  where: cmdWhere,                   // /parked 와 통합.
  chargers: cmdChargers,
  places: cmdPlaces,
};

export async function handleCallback(cb) {
  const chatId = String(cb.message?.chat?.id || '');
  const data = String(cb.data || '');
  const callbackQueryId = cb.id;

  // ack 우선 — 안 하면 모바일 앱 로딩 spinner 가 30초간 남음.
  await answerCallbackQuery(callbackQueryId);

  if (!chatId) return;
  const user = await getUser(chatId);
  if (!user || user.role === 'denied' || user.role === 'pending') return;

  // sns:<action> — 글쓰기 다단계 대화 inline 버튼.
  if (data.startsWith('sns:')) {
    if (!(await hasPermission(chatId, 'sns'))) return;
    return handleSnsCallback(chatId, data.slice(4), user);
  }

  // places:<freq|dwell> — 가는 곳 종류 분기.
  if (data.startsWith('places:')) {
    if (!(await hasPermission(chatId, 'car'))) return;
    const kind = data.slice(7);
    if (kind === 'freq')  return showFreqPlaces(chatId);
    if (kind === 'dwell') return showDwellPlaces(chatId);
    return;
  }

  // cmd:<name> — 데이터 명령 후속 액션.
  const m = data.match(/^cmd:([a-z]+)$/);
  if (!m) return;
  const fn = CB_ROUTES[m[1]];
  if (!fn) return;

  // 데이터 명령 = car feature 권한 필요.
  if (!(await hasPermission(chatId, 'car'))) return;
  return fn({ chatId, args: '', user });
}

// SNS 글쓰기 다단계 대화 — pending 상태 + 사용자 액션 분기.
async function handleSnsCallback(chatId, action, user) {
  if (action === 'cancel') {
    clearPending(chatId);
    return sendMessage('❌ 글쓰기를 취소했어요.', chatId);
  }
  if (action === 'edit') {
    setPending(chatId, 'sns:body');
    return sendMessage(
      '✏️ 다시 본문/사진을 보내주세요. (5분 안)',
      chatId,
      snsCancelKeyboard(),
    );
  }
  if (action === 'publish') {
    const p = getPending(chatId);
    if (!p || p.action !== 'sns:confirm') {
      return sendMessage('⏰ 입력 시간이 지났어요. 다시 시도해 주세요.', chatId);
    }
    const r = await dashPost('/api/sns/blog', {
      platform: 'naver',
      body: p.data.body || '',
      photos: p.data.photos || [],
      chat_id: chatId,
      user_name: user?.name || null,
    });
    clearPending(chatId);
    if (r?.ok) {
      return sendMessage(
        [
          '✅ 서버 전달 확인됨 (mock)',
          '',
          `<i>요청 ID: ${escapeHtml(r.request_id || '-')}</i>`,
          '<i>실제 발행은 후속 PR에서 추가됩니다.</i>',
        ].join('\n'),
        chatId,
      );
    }
    return sendMessage(
      `❌ 서버 전달 실패\n<i>${escapeHtml(r?.error || 'unknown')}</i>`,
      chatId,
    );
  }
}

// 글쓰기 진입/수정 단계용 inline 키보드 ([❌ 취소] 만).
function snsCancelKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [[{ text: '❌ 취소', callback_data: 'sns:cancel' }]],
    },
  };
}

// 글쓰기 미리보기 단계용 inline 키보드 ([✅ 발행] [✏️ 수정] [❌ 취소]).
function snsConfirmKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ 발행', callback_data: 'sns:publish' },
        { text: '✏️ 수정', callback_data: 'sns:edit' },
        { text: '❌ 취소', callback_data: 'sns:cancel' },
      ]],
    },
  };
}

// pending 액션 진행 중인 사용자 메시지 처리.
// 반환: true = 처리됨(상위 흐름 중단), false = 처리 안 됨(상위 흐름 계속).
async function handlePendingMessage(chatId, message, pending, user) {
  if (pending.action !== 'sns:body') return false;

  const text = (message.text || message.caption || '').trim();
  // 한글 라벨 매핑 — 다단계 중 다른 카테고리 버튼 누르는 케이스.
  const mapped = BUTTON_TO_CMD[text];
  // 명시적 명령 / 메인복귀 / 다른 카테고리 라벨이면 pending 취소하고 통과.
  if (
    text === NAV_HOME ||
    (await categoryByLabel(text)) ||
    text.startsWith('/') ||
    mapped
  ) {
    clearPending(chatId);
    return false; // 상위 흐름이 처리하도록 통과.
  }

  // 본문/사진 받기.
  const body = text;
  const photos = Array.isArray(message.photo) && message.photo.length
    ? [{
        file_id: message.photo[message.photo.length - 1].file_id,
        width:   message.photo[message.photo.length - 1].width || null,
        height:  message.photo[message.photo.length - 1].height || null,
      }]
    : [];

  if (!body && !photos.length) {
    return sendMessage(
      '본문 또는 사진을 보내주세요. 둘 다 가능합니다.',
      chatId,
      snsCancelKeyboard(),
    ).then(() => true);
  }

  // 미리보기 데이터 저장 — 발행 단계에서 사용.
  setPending(chatId, 'sns:confirm', { body, photos });

  // 정리된 미리보기 표시.
  const lines = [
    '📝 <b>발행 미리보기</b>',
    '',
    `<b>플랫폼</b>: 네이버 블로그`,
  ];
  if (body) {
    lines.push(`<b>본문</b> (${body.length}자):`);
    lines.push(`<code>${escapeHtml(body.slice(0, 500))}${body.length > 500 ? '…' : ''}</code>`);
  }
  if (photos.length) {
    lines.push(`<b>사진</b>: ${photos.length}장 첨부`);
    lines.push(`<i>file_id: ${escapeHtml(photos[0].file_id.slice(0, 30))}…</i>`);
  }
  lines.push('');
  lines.push('<i>발행하시려면 아래 버튼을 눌러주세요.</i>');

  await sendMessage(lines.join('\n'), chatId, snsConfirmKeyboard());
  return true;
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
    ? `🤔 '${escapeHtml(slashHead)}' 명령은 아직 없어요.`
    : '🤔 메시지를 이해하지 못했어요.';
  return sendMessage(
    `${head}\n채팅창 하단의 버튼을 누르거나 <b>/help</b> 를 확인해 주세요.`,
    chatId,
  );
}

// ── 핸들러 ────────────────────────────────────────────

async function cmdStart({ chatId }) {
  return cmdHelp({ chatId });
}

// 카테고리별 명령 카탈로그 — /help 표시 + setMyCommands + reply 키보드 공통 소스.
// btn: Reply 키보드에 노출되는 한글 라벨. 누르면 그 텍스트가 봇에 전송 → BUTTON_TO_CMD 로 슬래시 매핑.
const CATEGORY_COMMANDS = {
  car: [
    { cmd: '/soc',       desc: '배터리 % · 거리 · 충전 (통합)',          btn: '🔋 배터리' },
    { cmd: '/period',    desc: '오늘·이번주·저번주·이번달·이전달 (km·전비)', btn: '📊 요약' },
    { cmd: '/where',     desc: '현재 위치 (정차/주행 통합)',             btn: '📍 위치' },
    { cmd: '/places',    desc: '자주가는 곳 / 오래머문 곳 TOP3 (집·회사 제외)', btn: '🗺 가는 곳' },
    { cmd: '/chargers',  desc: '즐겨찾기 충전기 사용량',                 btn: '🔌 충전기' },
  ],
  family: [
    { cmd: '/weather',   desc: '오늘 날씨 (mock)',           btn: '🌤 오늘 날씨' },
    { cmd: '/forecast',  desc: '강수 사전 알림 (mock)',      btn: '🌧 강수 예보' },
    { cmd: '/event',     desc: '일정 등록·조회 (mock)',      btn: '📅 일정' },
    { cmd: '/memo',      desc: '메모/장보기 (mock)',         btn: '📝 메모' },
  ],
  sns: [
    { cmd: '/post',      desc: '블로그 발행 (mock)',         btn: '📝 글쓰기' },
  ],
  // 새 카테고리 추가 시 여기에 명령 목록.
};

// Reply 키보드 한글 라벨 → 슬래시 명령 매핑. 정확 일치만 허용 (자연어 매칭 X).
const BUTTON_TO_CMD = {};
for (const arr of Object.values(CATEGORY_COMMANDS)) {
  for (const c of arr) if (c.btn) BUTTON_TO_CMD[c.btn] = c.cmd;
}

// 데이터 명령 응답 끝에 동봉할 inline 후속 액션 (1행 3버튼).
// 첫 칸은 항상 🔄 새로고침 (같은 명령 재실행).
// 나머지 2칸은 응답 컨텍스트와 연관성 높은 후속 명령.
// callback_data 포맷: 'cmd:<name>'.
const FOLLOWUP = {
  soc:      [['🔄', 'cmd:soc'],      ['📍 위치', 'cmd:where'],    ['🔌 충전기', 'cmd:chargers']],
  where:    [['🔄', 'cmd:where'],    ['🗺 가는 곳', 'cmd:places'],['📊 요약', 'cmd:period']],
  period:   [['🔄', 'cmd:period'],   ['🔋 배터리', 'cmd:soc'],    ['🔌 충전기', 'cmd:chargers']],
  chargers: [['🔄', 'cmd:chargers'], ['🔋 배터리', 'cmd:soc'],    ['📊 요약', 'cmd:period']],
  places:   [['🔄', 'cmd:places'],   ['📍 위치', 'cmd:where'],    ['📊 요약', 'cmd:period']],
};

function followUp(cmdKey) {
  const set = FOLLOWUP[cmdKey];
  if (!set) return null;
  return {
    reply_markup: {
      inline_keyboard: [set.map(([text, callback_data]) => ({ text, callback_data }))],
    },
  };
}

// 텔레그램 입력창 [/] 메뉴 자동완성을 사용자별로 비움.
// 봇은 Reply 키보드 진입만 사용 — 슬래시는 채팅창에 직접 입력하면 응답·가이드가 잘 나오므로
// 좌측 [/] 메뉴는 중복. 기존에 등록됐던 메뉴를 비우려고 가입 승인/그룹 변경 시 호출.
export async function syncUserMenu(chatId) {
  return deleteMyCommands(chatId);
}

// 카테고리 폴더형 Reply 키보드 — 메인 진입은 카테고리 라벨, 누르면 sub-keyboard 로 갈아끼움.
// 비IT 가족 친화: 한글 라벨, 단계 1단, 채팅창 깔끔.
const NAV_HOME = '⬅️ 메인';

// 메인 키보드 — 사용자가 권한 보유한 카테고리들.
async function buildMainKeyboard(chatId) {
  const cats = await getCategories();
  const buttons = [];
  for (const cat of cats) {
    // 명령이 등록된 카테고리만 (common 처럼 명령 없는 슬롯은 노출 X).
    if (!CATEGORY_COMMANDS[cat.key]?.length) continue;
    if (!(await hasPermission(chatId, cat.key))) continue;
    buttons.push({ text: cat.label });
  }
  if (!buttons.length) return null;
  const rows = [];
  for (let i = 0; i < buttons.length; i += 3) {
    rows.push(buttons.slice(i, i + 3));
  }
  return { keyboard: rows, resize_keyboard: true, is_persistent: true };
}

// 카테고리별 sub-keyboard — 해당 카테고리 명령 + ⬅️ 메인.
function buildSubKeyboard(catKey) {
  const cmds = CATEGORY_COMMANDS[catKey] || [];
  if (!cmds.length) return null;
  const buttons = cmds.map((c) => ({ text: c.btn || c.cmd }));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 3) {
    rows.push(buttons.slice(i, i + 3));
  }
  rows.push([{ text: NAV_HOME }]);
  return { keyboard: rows, resize_keyboard: true, is_persistent: true };
}

// 텍스트가 카테고리 라벨이면 그 카테고리 key 반환. 아니면 null.
async function categoryByLabel(label) {
  const cats = await getCategories();
  return cats.find((c) => c.label === label)?.key || null;
}

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
  const kb = await buildMainKeyboard(chatId);
  return sendMessage(lines.join('\n'), chatId, kb ? { reply_markup: kb } : {});
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
  const isRoot = u.role === 'root';
  const lines = [
    `<b>내 정보</b>`,
    `이름: ${escapeHtml(u.name || '-')}`,
    `역할: ${u.role}`,
    `권한: ${feats}`,
  ];
  // chat_id 는 운영용 식별자라 root 한테만 노출 — 일반 가족 사용자엔 의미 없는 숫자.
  if (isRoot) lines.push(`<i>chat_id: <code>${chatId}</code></i>`);
  return sendMessage(lines.join('\n'), chatId);
}

// 배터리 + 거리 + 충전 통합 응답.
//   1행: 🔋 % (사용가능) · 🛣 km 남음 (예상)
//   2행: ⚡ 충전 중 (상세) | ⚡ 충전 중 아님 + 마지막 충전 기록
async function cmdSoc({ chatId }) {
  const [car, ch] = await Promise.all([
    dashGet('/api/car'),
    dashGet('/api/charging-status'),
  ]);
  if (!car || car.error) return sendMessage('데이터를 가져오지 못했어요', chatId);
  if (car.battery_level == null) return sendMessage('포지션 데이터 없음', chatId);

  const usable = car.usable_battery_level != null && car.usable_battery_level !== car.battery_level
    ? `  <i>(사용가능 ${car.usable_battery_level}%)</i>`
    : '';
  const rated = car.rated_battery_range;
  const est = car.est_battery_range;

  // 1행: 배터리 % (큰 글씨)
  // 2행: 거리 (rated · 예상)
  // 3행~: 충전 상태
  const lines = [
    `🔋  <b>${car.battery_level}%</b>${usable}`,
  ];
  if (rated != null) {
    const estPart = est && est !== rated ? `  <i>(예상 ${est} km)</i>` : '';
    lines.push(`🛣  <b>${rated} km</b> 남음${estPart}`);
  }
  lines.push(''); // 충전 정보 사이 빈 줄

  if (ch?.charging) {
    const power = ch.charger_power != null ? Number(ch.charger_power).toFixed(1) : null;
    const kwh = Number(ch.charge_energy_added || 0).toFixed(2);
    const startSoc = ch.start_battery_level ?? '?';
    const elapsedMin = ch.start_date
      ? Math.floor((Date.now() - new Date(ch.start_date).getTime()) / 60000)
      : null;
    const fb = ch.fallback ? ' <i>(폴백)</i>' : '';
    lines.push(`⚡  <b>충전 중</b>${fb}  ${startSoc}% → <b>${car.battery_level}%</b>`);
    const meta = [`📥 ${kwh} kWh`];
    if (power) meta.push(`${power} kW`);
    if (elapsedMin != null) meta.push(`${fmtElapsed(elapsedMin)} 경과`);
    lines.push(`<i>${meta.join(' · ')}</i>`);
  } else {
    lines.push(`⚡  충전 중 아님`);
    const last = car.last_charge;
    if (last) {
      lines.push(`<i>마지막: ${formatKst(last.end_date)}  ${last.soc_start ?? '?'}% → ${last.soc_end ?? '?'}%</i>`);
    }
  }

  if (car.last_seen) lines.push(`<i>업데이트: ${formatKst(car.last_seen)}</i>`);
  return sendMessage(lines.join('\n'), chatId, followUp('soc'));
}

// /parked 와 /where 통합 — 정차 중이면 장소·경과, 주행 중이면 시작 시각 + 현재 좌표 + 핀.
async function cmdWhere({ chatId }) {
  const [park, loc] = await Promise.all([
    dashGet('/api/parked'),
    dashGet('/api/location'),
  ]);
  const parkErr = !park || park.error;
  const locErr  = !loc  || loc.error;
  if (parkErr && locErr) return sendMessage('데이터를 가져오지 못했어요', chatId);

  const lines = [];
  if (!parkErr && park.driving) {
    lines.push('🚗 <b>주행 중</b>');
    if (park.drive_started_at) lines.push(`<i>시작: ${formatKst(park.drive_started_at)}</i>`);
  } else if (!parkErr && park.parked) {
    const p = park.parked;
    lines.push(`🅿️ <b>${escapeHtml(p.place || '?')}</b>`);
    lines.push(`<i>정차: ${formatKst(p.end_date)} (${fmtElapsed(p.elapsed_min)} 전)</i>`);
  }

  let lat = null, lng = null;
  if (!locErr && loc.lat != null) {
    lat = Number(loc.lat); lng = Number(loc.lng);
    const latS = lat.toFixed(6);
    const lngS = lng.toFixed(6);
    const url = `https://maps.google.com/?q=${latS},${lngS}`;
    if (lines.length) lines.push('');
    lines.push(`📍 <a href="${url}">${latS}, ${lngS}</a>`);
    lines.push(`<i>업데이트: ${formatKst(loc.date)}</i>`);
  }

  if (!lines.length) return sendMessage('위치 데이터 없음', chatId, followUp('where'));

  await sendMessage(lines.join('\n'), chatId, followUp('where'));
  if (lat != null && lng != null) return sendLocation(lat, lng, chatId);
}

// 새 핸들러는 dashboard API 호출만 — TeslaMate DB 직접 쿼리는 dashboard 가 책임.
// 기존 /soc /today /where 도 같은 패턴으로 점진 마이그 (후속 PR).

function fmtElapsed(min) {
  if (!Number.isFinite(min) || min < 0) return '?';
  return min >= 60
    ? `${Math.floor(min / 60)}시간 ${min % 60}분`
    : `${min}분`;
}

// 이번주·지난주·이번달 한 응답에 — 짧은 퀵뷰. 상세는 대시보드.
// 5구간 한 응답에 — km 와 전비만 (퀵뷰). 상세는 대시보드.
//   오늘 / 이번주(월~) / 저번주 / 이번달(=최근 4주 롤링) / 이전달(=직전 4주)
//   '이번달' 은 캘린더가 아닌 28일 롤링 — 월초 빈약 회피.
async function cmdPeriod({ chatId }) {
  const j = await dashGet('/api/summary?range=multi');
  if (!j || j.error) return sendMessage('데이터를 가져오지 못했어요', chatId);

  const fmt = (key, label) => {
    const r = j[key];
    if (!r) return `<b>${label}</b>  -`;
    const d = r.drives || {};
    const km = Number(d.km || 0);
    if (km <= 0) return `<b>${label}</b>  -`;
    const eff = Number(d.eff_wh_km || 0);
    const effStr = eff > 0 ? ` · ${eff} Wh/km` : '';
    return `<b>${label}</b>  ${km.toFixed(0)} km${effStr}`;
  };

  const lines = [
    '<b>📊 요약</b>',
    '',
    fmt('today',           '오늘   '),
    fmt('this_week',       '이번주 '),
    fmt('last_week',       '저번주 '),
    fmt('rolling_4w',      '최근 4주'),
    fmt('prev_rolling_4w', '직전 4주'),
    '',
    '<i>최근 4주 = 28일 롤링 (월초 빈약 회피)</i>',
    '<i>상세는 대시보드 /v2 에서</i>',
  ];
  return sendMessage(lines.join('\n'), chatId, followUp('period'));
}

// 즐겨찾기 충전기 — 대시보드의 동별 그룹과 동일하게 묶어 한 줄 요약.
// 즐겨찾기(⭐ 4개)는 줄별로, 참고 그룹은 한 줄 압축.
// 그룹 정의 단일 진실원: dashboard constants.js → /api/home-charger/groups.
async function cmdChargers({ chatId }) {
  const j = await dashGet('/api/home-charger/groups');
  if (!j || j.error) {
    return sendMessage(
      `🔌 충전기 데이터를 가져오지 못했어요\n<i>${escapeHtml(j?.error || '연결 오류').slice(0, 80)}</i>`,
      chatId,
      followUp('chargers'),
    );
  }
  if (!Array.isArray(j.groups) || !j.groups.length) {
    return sendMessage('🔌 등록된 충전기가 없어요', chatId, followUp('chargers'));
  }

  const fav = j.groups.filter((g) => g.favorite);
  const ref = j.groups.filter((g) => !g.favorite);

  const lines = ['🔌 <b>충전기</b>', ''];

  // 즐겨찾기 — 한 줄씩 상세
  for (const g of fav) {
    const icon = g.available > 0 ? '🟢' : (g.using > 0 ? '🔴' : '⚫');
    let line = `${icon} <b>${g.title}</b>  가용 ${g.available} · 충전중 ${g.using} / ${g.total}`;
    const extra = [];
    if (g.offline) extra.push(`오프라인 ${g.offline}`);
    if (g.maintain) extra.push(`점검 ${g.maintain}`);
    if (extra.length) line += `  <i>(${extra.join(', ')})</i>`;
    lines.push(line);
  }

  // 참고 그룹 — 한 줄에 압축. "105 가용 2/3 · 111 가용 1/3 · ..."
  if (ref.length) {
    lines.push('');
    lines.push('<i>' + ref.map((g) => `${g.title} ${g.available}/${g.total}`).join(' · ') + '</i>');
  }

  lines.push('');
  if (j.fetchedAt) lines.push(`<i>업데이트: ${formatKst(j.fetchedAt)}${j.stale ? ' · 캐시' : ''}</i>`);
  lines.push('<i>상세는 대시보드 /v2 에서</i>');
  return sendMessage(lines.join('\n'), chatId, followUp('chargers'));
}

// 자주 가는 곳 + 오래 머문 곳 TOP 3 — 집/회사 제외.
const PINNED_PLACES = new Set(['집', '회사', 'Home', 'Work']);

function fmtSecHm(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '?';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h >= 1) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  return `${m}분`;
}

// /places — 분기 진입 화면. 자주/오래 각각 10개를 inline 버튼으로 분리.
async function cmdPlaces({ chatId }) {
  return sendMessage(
    [
      '🗺 <b>가는 곳</b> <i>(집·회사 제외)</i>',
      '',
      '어떤 기준으로 볼까요?',
    ].join('\n'),
    chatId,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '📍 자주가는 곳 TOP 10',  callback_data: 'places:freq' },
          { text: '⏱ 오래머문 곳 TOP 10', callback_data: 'places:dwell' },
        ]],
      },
    },
  );
}

// places:freq | places:dwell — 각각 10개 리스트 + 다른 종류로 전환 버튼.
async function showFreqPlaces(chatId) {
  const j = await dashGet('/api/frequent-places');
  if (!j || j.error) return sendMessage('데이터를 가져오지 못했어요', chatId, placesNavKb('freq'));
  const top = (j.places || []).filter((p) => !PINNED_PLACES.has(p.geofence_name)).slice(0, 10);
  const cap = (s) => escapeHtml(String(s || '?').slice(0, 28));
  const lines = ['📍 <b>자주가는 곳 TOP 10</b> <i>(집·회사 제외)</i>', ''];
  if (!top.length) lines.push('<i>데이터 없음</i>');
  top.forEach((p, i) => {
    lines.push(`${String(i + 1).padStart(2, ' ')}. ${cap(p.label)} · ${p.visit_count}회`);
  });
  lines.push('');
  lines.push('<i>상세는 대시보드 /v2 에서</i>');
  return sendMessage(lines.join('\n'), chatId, placesNavKb('freq'));
}

async function showDwellPlaces(chatId) {
  const j = await dashGet('/api/long-stay-places');
  if (!j || j.error) return sendMessage('데이터를 가져오지 못했어요', chatId, placesNavKb('dwell'));
  const top = (j.places || []).filter((p) => !PINNED_PLACES.has(p.geofence_name)).slice(0, 10);
  const cap = (s) => escapeHtml(String(s || '?').slice(0, 28));
  const lines = ['⏱ <b>오래머문 곳 TOP 10</b> <i>(집·회사 제외)</i>', ''];
  if (!top.length) lines.push('<i>데이터 없음</i>');
  top.forEach((p, i) => {
    lines.push(`${String(i + 1).padStart(2, ' ')}. ${cap(p.label)} · ${fmtSecHm(p.total_dwell_sec || p.max_dwell_sec || 0)}`);
  });
  lines.push('');
  lines.push('<i>상세는 대시보드 /v2 에서</i>');
  return sendMessage(lines.join('\n'), chatId, placesNavKb('dwell'));
}

// current = 현재 보고 있는 종류. 🔄 = 같은 종류 재실행, 다른 버튼 = 반대 종류.
function placesNavKb(current) {
  const other = current === 'freq' ? 'dwell' : 'freq';
  const otherLabel = other === 'freq' ? '📍 자주가는 곳' : '⏱ 오래머문 곳';
  return {
    reply_markup: {
      inline_keyboard: [[
        { text: '🔄',          callback_data: `places:${current}` },
        { text: otherLabel,    callback_data: `places:${other}` },
      ]],
    },
  };
}

// ── family (mock) ────────────────────────────────────
// 인터페이스 검증용 placeholder. 실제 구현은 후속 PR.
async function cmdWeather({ chatId }) {
  return sendMessage(
    [
      '🌤 <b>오늘 날씨</b> (mock)',
      '',
      '<i>기상청 단기예보 연동은 준비 중입니다.</i>',
      '<i>예정: 강수확률 / 기온 / 미세먼지 한 화면 요약</i>',
    ].join('\n'),
    chatId,
  );
}

async function cmdForecast({ chatId }) {
  return sendMessage(
    [
      '🌧 <b>강수 사전 알림</b> (mock)',
      '',
      '<i>비/눈 1~2시간 전 자동 알림 — 가족 broadcast 예정.</i>',
      '<i>현재는 알림 폴러 미구현.</i>',
    ].join('\n'),
    chatId,
  );
}

async function cmdEvent({ chatId }) {
  return sendMessage(
    [
      '📅 <b>일정 관리</b> (mock)',
      '',
      '<i>등록·조회·반복 일정 + 사전 알림 — 다단계 대화로 입력 예정.</i>',
      '<i>현재는 placeholder.</i>',
    ].join('\n'),
    chatId,
  );
}

async function cmdMemo({ chatId }) {
  return sendMessage(
    [
      '📝 <b>메모/장보기</b> (mock)',
      '',
      '<i>가족 공유 메모 + 항목별 ✅ 완료 체크 예정.</i>',
      '<i>현재는 placeholder.</i>',
    ].join('\n'),
    chatId,
  );
}

// ── SNS (mock) ───────────────────────────────────────
// 다단계 대화: cmdPost → pending 'sns:body' → 사용자 메시지(텍스트/사진/사진+캡션)
// → handlePendingMessage 가 미리보기 표시 + pending 'sns:confirm' → [✅ 발행] inline
// → handleSnsCallback('publish') 가 dashboard POST + clearPending.
// 인자 있으면 즉시 본문 입력으로 간주 — 한 줄 발행 단축 (사진은 다음 메시지로 보낼 수 없음).
async function cmdPost({ chatId, args, user }) {
  const body = (args || '').trim();
  if (!body) {
    setPending(chatId, 'sns:body');
    return sendMessage(
      [
        '📝 <b>블로그 글쓰기</b> (mock)',
        '',
        '본문을 보내주세요. 사진도 첨부 가능합니다.',
        '<i>(텍스트만 / 사진만 / 사진+캡션 모두 OK · 5분 안)</i>',
      ].join('\n'),
      chatId,
      snsCancelKeyboard(),
    );
  }
  // 인자로 들어온 단축 모드 — 즉시 미리보기 단계로.
  setPending(chatId, 'sns:confirm', { body, photos: [] });
  const lines = [
    '📝 <b>발행 미리보기</b>',
    '',
    `<b>플랫폼</b>: 네이버 블로그`,
    `<b>본문</b> (${body.length}자):`,
    `<code>${escapeHtml(body.slice(0, 500))}${body.length > 500 ? '…' : ''}</code>`,
    '',
    '<i>발행하시려면 아래 버튼을 눌러주세요.</i>',
  ];
  return sendMessage(lines.join('\n'), chatId, snsConfirmKeyboard());
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
  // 대상자 [/] 메뉴 갱신 + 도움말 안내.
  try { await syncUserMenu(target); } catch (e) { console.error('[setgroup] syncUserMenu', e?.message); }
  try {
    await sendMessage(
      [
        `🎉 사용 가능해요!`,
        ``,
        `채팅창 하단의 버튼을 누르거나 <b>/help</b> 로 시작하세요.`,
      ].join('\n'),
      target,
    );
    // /help 자동 호출 — 첫 사용 진입 부담 줄임.
    await cmdHelp({ chatId: target });
  } catch {}
}

async function cmdDeny({ chatId, args, user }) {
  const target = (args || '').split(/\s+/)[0];
  if (!/^\d+$/.test(target)) return sendMessage('사용법: /deny &lt;chat_id&gt;', chatId);
  const ok = await setRole(target, 'denied', user.chat_id);
  if (!ok) return sendMessage(`#${target} 없음`, chatId);
  // 차단된 사용자 [/] 메뉴 비우기.
  try { await syncUserMenu(target); } catch (e) { console.error('[deny] syncUserMenu', e?.message); }
  return sendMessage(`🚫 #${target} 차단됨`, chatId);
}
