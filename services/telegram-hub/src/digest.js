// 일일 요약 (매일 22:00 KST) + 주간 요약 (매주 월 07:00 KST).
// /api/summary 재활용 — DB 직접 쿼리 금지 (CLAUDE.md 데이터 경로 원칙).

import { sendMessage } from './telegram.js';
import { getState, setState } from './state.js';
import { formatDur } from './format.js';
import { getUsersWithFeature } from './auth.js';
import { dashGet } from './dash.js';

const TICK_MS = 60_000;
const DAILY_HOUR = 22;
const WEEKLY_HOUR = 7;
const WEEKLY_DOW = 1; // 월요일 (0=Sun)

function kstNow() {
  return new Date(Date.now() + 9 * 3600 * 1000);
}

function kstYmd() {
  const x = kstNow();
  return `${x.getUTCFullYear()}${String(x.getUTCMonth() + 1).padStart(2, '0')}${String(x.getUTCDate()).padStart(2, '0')}`;
}

function kstYmdLabel() {
  const x = kstNow();
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
}

async function broadcast(text) {
  let recipients = [];
  try { recipients = await getUsersWithFeature('car'); } catch {}
  if (!recipients.length && process.env.TELEGRAM_CHAT_ID) {
    recipients = [String(process.env.TELEGRAM_CHAT_ID)];
  }
  for (const r of recipients) {
    try { await sendMessage(text, r); } catch (e) { console.error('[digest] send', e.message); }
  }
}

function fmtDigest(title, agg) {
  const d = agg?.drives || { n: 0, km: 0, dur: 0, eff_wh_km: 0 };
  const c = agg?.charges || { n: 0, kwh: 0 };
  if (d.n === 0 && c.n === 0) return `${title}\n— 활동 없음`;

  const lines = [title];
  if (d.n > 0) {
    const kmPerKwh = d.eff_wh_km > 0 ? (1000 / d.eff_wh_km).toFixed(1) : null;
    const effPart = d.eff_wh_km > 0
      ? `\n⚡ ${d.eff_wh_km}Wh/km${kmPerKwh ? ` · ${kmPerKwh}km/kWh` : ''}`
      : '';
    lines.push(`🚗 ${d.n}회 · 🛣️ ${Number(d.km).toFixed(1)}km · ⏱️ ${formatDur(d.dur)}${effPart}`);
  }
  if (c.n > 0) {
    lines.push(`🔋 ${c.n}회 · ⚡ +${Number(c.kwh).toFixed(1)}kWh`);
  }
  return lines.join('\n');
}

async function emitDaily() {
  const j = await dashGet('/api/summary?range=today');
  if (!j || j.error) return;
  const text = fmtDigest(`📊 <b>오늘 요약</b> (${kstYmdLabel()})`, j);
  await broadcast(text);
}

async function emitWeekly() {
  const j = await dashGet('/api/summary?range=last-week');
  if (!j || j.error) return;
  const text = fmtDigest('📅 <b>지난 주 요약</b>', j);
  await broadcast(text);
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    const x = kstNow();
    const h = x.getUTCHours();
    const m = x.getUTCMinutes();
    const dow = x.getUTCDay();
    const ymd = kstYmd();
    const s = getState();

    // 일일: 22:00~22:04 사이 첫 호출에서 1회 발송 (분 단위 폴링 노이즈 흡수)
    if (h === DAILY_HOUR && m < 5 && s.last_daily_ymd !== ymd) {
      await emitDaily();
      setState({ last_daily_ymd: ymd });
    }
    // 주간: 월 07:00~07:04
    if (dow === WEEKLY_DOW && h === WEEKLY_HOUR && m < 5 && s.last_weekly_ymd !== ymd) {
      await emitWeekly();
      setState({ last_weekly_ymd: ymd });
    }
  } catch (e) {
    console.error('[digest] tick', e?.message || e);
  } finally {
    running = false;
  }
}

export function startDigestScheduler() {
  setInterval(tick, TICK_MS);
  tick();
  console.log('[digest] scheduler started — daily 22:00 KST, weekly Mon 07:00 KST');
}
