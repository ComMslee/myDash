import { pool, getCarId } from './db.js';
import { sendMessage, sendLocation, escapeHtml } from './telegram.js';
import { formatKst } from './format.js';

export async function handleCommand(text, chatId) {
  const cmd = text.trim().split(/\s+/)[0].toLowerCase().split('@')[0];
  switch (cmd) {
    case '/start':
    case '/help':
      return cmdHelp(chatId);
    case '/soc':
      return cmdSoc(chatId);
    case '/today':
      return cmdToday(chatId);
    case '/where':
      return cmdWhere(chatId);
    default:
      return sendMessage(`알 수 없는 명령: ${escapeHtml(cmd)}\n/help 입력해 사용 가능 명령 확인`, chatId);
  }
}

async function cmdHelp(chatId) {
  return sendMessage([
    '<b>myDash 봇 명령</b>',
    '/soc — 현재 배터리 % + 충전 여부',
    '/today — 오늘 (KST) 주행/충전 요약',
    '/where — 현재 위치 (지도 핀)',
    '/help — 이 도움말',
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

  const dayStart = `(NOW() AT TIME ZONE 'Asia/Seoul')::date AT TIME ZONE 'Asia/Seoul'`;

  const { rows: dr } = await pool.query(
    `SELECT COUNT(*)::int AS n,
            COALESCE(SUM(distance), 0)::float AS km,
            COALESCE(SUM(duration_min), 0)::int AS dur
     FROM drives
     WHERE car_id = $1 AND start_date >= ${dayStart}`,
    [carId],
  );
  const { rows: ch } = await pool.query(
    `SELECT COUNT(*)::int AS n,
            COALESCE(SUM(charge_energy_added), 0)::float AS kwh
     FROM charging_processes
     WHERE car_id = $1 AND start_date >= ${dayStart}`,
    [carId],
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
