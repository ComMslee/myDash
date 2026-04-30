import { pool, getCarId } from './db.js';
import { sendMessage, sendLocation, escapeHtml } from './telegram.js';
import { formatKst } from './format.js';

// ── 자연어 라우팅 패턴 ─────────────────────────────────
// 첫 매칭 승. /cmd 보다 후순위.
const NL_PATTERNS = [
  { name: 'soc',   re: /(배터리|충전.*상태|soc|몇\s*%|얼마나.*남|남은|잔량)/i,                      handler: cmdSoc   },
  { name: 'today', re: /(오늘|today|얼마나.*달렸|오늘.*주행|오늘.*충전|운행.*기록)/i,             handler: cmdToday },
  { name: 'where', re: /(어디|위치|where|지도|location|어디야|어디에)/i,                            handler: cmdWhere },
  { name: 'help',  re: /(도움말|help|뭐\s*할|어떻게.*써|명령.*뭐|기능.*뭐)/i,                         handler: cmdHelp  },
];

// hub_unmatched_inputs 스키마 idempotent 생성 (첫 호출 시).
let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
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
  _schemaReady = true;
}

export async function handleCommand(text, chatId) {
  const t = (text || '').trim();
  if (!t) return;

  // 1) /cmd
  if (t.startsWith('/')) {
    const head = t.split(/\s+/)[0].toLowerCase().split('@')[0];
    const args = t.slice(head.length).trim();
    switch (head) {
      case '/start':
      case '/help':       return cmdHelp(chatId);
      case '/soc':        return cmdSoc(chatId);
      case '/today':      return cmdToday(chatId);
      case '/where':      return cmdWhere(chatId);
      case '/unmatched':  return cmdUnmatched(chatId);
      case '/topnope':    return cmdTopNope(chatId);
      case '/resolve':    return cmdResolve(args, chatId);
      default:
        return logAndPunt(t, chatId, head);
    }
  }

  // 2) NL 패턴
  for (const p of NL_PATTERNS) {
    if (p.re.test(t)) return p.handler(chatId);
  }

  // 3) 미해결 — 로그 + 폴백
  return logAndPunt(t, chatId, null);
}

async function logAndPunt(text, chatId, slashHead) {
  try {
    await ensureSchema();
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
  return sendMessage(
    `${head}\n/help 보기 · /unmatched 로 누적 표현 확인`,
    chatId,
  );
}

async function cmdHelp(chatId) {
  return sendMessage([
    '<b>Ye\'s Home 봇</b>',
    '',
    '<b>데이터</b>',
    '/soc — 현재 배터리 % + 충전 여부',
    '/today — 오늘 (KST) 주행/충전 요약',
    '/where — 현재 위치 (지도 핀)',
    '',
    '<b>운영</b>',
    '/unmatched — 미해결 입력 누적',
    '/topnope — 자주 못 알아들은 표현 TOP 5',
    '/resolve 1,2,3 — 해당 ID 해결 처리',
    '',
    '<i>자연어도 일부 지원</i> (예: "오늘 얼마나 달렸어?", "배터리 얼마나 남았어?")',
  ].join('\n'), chatId);
}

async function cmdSoc(chatId) {
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

async function cmdToday(chatId) {
  const carId = await getCarId();
  if (!carId) return sendMessage('차량 정보 없음', chatId);

  // KST 자정의 UTC 시각 — TeslaMate start_date 가 timestamp(no tz, UTC 값) 이라
  // 세션 타임존에 의존하지 않게 JS 에서 계산해서 파라미터로 전달.
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

async function cmdWhere(chatId) {
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

async function cmdUnmatched(chatId) {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT id, ts, text FROM hub_unmatched_inputs
     WHERE resolved = false
     ORDER BY ts DESC LIMIT 20`,
  );
  if (!rows.length) {
    return sendMessage('미해결 입력 없음 ✨', chatId);
  }
  const lines = ['<b>📋 미해결 (최근 20)</b>'];
  for (const r of rows) {
    lines.push(`#${r.id} · ${formatKst(r.ts)} · ${escapeHtml(r.text).slice(0, 60)}`);
  }
  lines.push('');
  lines.push('<i>패턴 추가 후 /resolve 1,2,3 으로 정리</i>');
  return sendMessage(lines.join('\n'), chatId);
}

async function cmdTopNope(chatId) {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT lower(trim(text)) AS norm, COUNT(*)::int AS n
     FROM hub_unmatched_inputs
     WHERE resolved = false
     GROUP BY norm
     ORDER BY n DESC, MAX(ts) DESC
     LIMIT 5`,
  );
  if (!rows.length) {
    return sendMessage('미해결 입력 없음 ✨', chatId);
  }
  const lines = ['<b>🔝 자주 못 알아들은 표현 TOP 5</b>'];
  for (const r of rows) {
    lines.push(`× ${r.n}  ${escapeHtml(r.norm).slice(0, 60)}`);
  }
  return sendMessage(lines.join('\n'), chatId);
}

async function cmdResolve(args, chatId) {
  await ensureSchema();
  const ids = String(args || '')
    .split(/[\s,]+/)
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!ids.length) {
    return sendMessage('사용법: /resolve 1,2,3', chatId);
  }
  const { rowCount } = await pool.query(
    `UPDATE hub_unmatched_inputs
     SET resolved=true, resolved_at=NOW()
     WHERE id = ANY($1::int[]) AND resolved = false`,
    [ids],
  );
  return sendMessage(`✅ ${rowCount}건 해결 처리`, chatId);
}
