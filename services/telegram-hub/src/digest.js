// 주간 요약 (토 09:00 KST, 이번 주 월~금) + 주말 요약 (월 09:00 KST, 직전 토·일).
// 일주일에 두 번만 발송 — 일일 알림 제거.
// /api/summary?range=weekdays|weekend 재활용 (CLAUDE.md 데이터 경로 원칙).

import { sendMessage } from './telegram.js';
import { getState, setState } from './state.js';
import { formatDur } from './format.js';
import { getUsersWithFeature } from './auth.js';
import { dashGet } from './dash.js';

const TICK_MS = 60_000;
const FIRE_HOUR = 9;
const SAT = 6; // 0=Sun, 6=Sat
const MON = 1;

function kstNow() {
  return new Date(Date.now() + 9 * 3600 * 1000);
}

function kstYmd() {
  const x = kstNow();
  return `${x.getUTCFullYear()}${String(x.getUTCMonth() + 1).padStart(2, '0')}${String(x.getUTCDate()).padStart(2, '0')}`;
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

function fmtAggBlock(agg) {
  const d = agg?.drives || { n: 0, km: 0, dur: 0, eff_wh_km: 0 };
  const c = agg?.charges || { n: 0, kwh: 0 };
  if (d.n === 0 && c.n === 0) return '— 활동 없음';
  const lines = [];
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

    if (h !== FIRE_HOUR || m >= 5) return;

    // 토 09:00 — 평일(월~금) 요약
    if (dow === SAT && s.last_weekdays_ymd !== ymd) {
      const j = await dashGet('/api/summary?range=weekdays');
      await broadcast(`📅 <b>주간 요약 (월~금)</b>\n${fmtAggBlock(j && !j.error ? j : null)}`);
      setState({ last_weekdays_ymd: ymd });
    }
    // 월 09:00 — 주말(토·일) 요약
    if (dow === MON && s.last_weekend_ymd !== ymd) {
      const j = await dashGet('/api/summary?range=weekend');
      await broadcast(`📅 <b>주말 요약 (토·일)</b>\n${fmtAggBlock(j && !j.error ? j : null)}`);
      setState({ last_weekend_ymd: ymd });
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
  console.log('[digest] scheduler — 주간(월~금) Sat 09:00 KST, 주말(토·일) Mon 09:00 KST.');
}
