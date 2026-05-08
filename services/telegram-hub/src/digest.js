// 일일 요약 (매일 09:00 KST, 전날치) + 주간 요약 (매주 월 09:00 KST, 지난 주).
// 월요일 09:00 은 두 요약을 한 메시지로 머지 발송 (중복 알림 방지).
// /api/summary 재활용 — DB 직접 쿼리 금지 (CLAUDE.md 데이터 경로 원칙).

import { sendMessage } from './telegram.js';
import { getState, setState } from './state.js';
import { formatDur } from './format.js';
import { getUsersWithFeature } from './auth.js';
import { dashGet } from './dash.js';

const TICK_MS = 60_000;
const FIRE_HOUR = 9;
const WEEKLY_DOW = 1; // 월요일 (0=Sun)

function kstNow() {
  return new Date(Date.now() + 9 * 3600 * 1000);
}

function kstYmd() {
  const x = kstNow();
  return `${x.getUTCFullYear()}${String(x.getUTCMonth() + 1).padStart(2, '0')}${String(x.getUTCDate()).padStart(2, '0')}`;
}

function kstYesterdayLabel() {
  const x = new Date(kstNow().getTime() - 86_400_000);
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

async function fetchDaily() {
  const j = await dashGet('/api/summary?range=yesterday');
  return (j && !j.error) ? j : null;
}

async function fetchWeekly() {
  const j = await dashGet('/api/summary?range=last-week');
  return (j && !j.error) ? j : null;
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

    // 09:00~09:04 사이 첫 호출에서 1회 발송 (분 단위 폴링 노이즈 흡수)
    if (h !== FIRE_HOUR || m >= 5) return;

    const isMonday = dow === WEEKLY_DOW;
    const dailyDone  = s.last_daily_ymd  === ymd;
    const weeklyDone = s.last_weekly_ymd === ymd;

    // 월요일 09:00: 일일+주간 머지 1회 발송
    if (isMonday && !dailyDone && !weeklyDone) {
      const [daily, weekly] = await Promise.all([fetchDaily(), fetchWeekly()]);
      const blocks = [];
      blocks.push(`📊 <b>어제 요약</b> (${kstYesterdayLabel()})\n${fmtAggBlock(daily)}`);
      blocks.push(`📅 <b>지난 주 요약</b>\n${fmtAggBlock(weekly)}`);
      await broadcast(blocks.join('\n\n'));
      setState({ last_daily_ymd: ymd, last_weekly_ymd: ymd });
      return;
    }

    // 평일 09:00: 일일만
    if (!dailyDone) {
      const daily = await fetchDaily();
      await broadcast(`📊 <b>어제 요약</b> (${kstYesterdayLabel()})\n${fmtAggBlock(daily)}`);
      setState({ last_daily_ymd: ymd });
    }
    // 월요일인데 일일은 이미 보낸 상태라면 주간만
    if (isMonday && !weeklyDone) {
      const weekly = await fetchWeekly();
      await broadcast(`📅 <b>지난 주 요약</b>\n${fmtAggBlock(weekly)}`);
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
  console.log('[digest] scheduler — daily 09:00 KST(전날치), weekly Mon 09:00 KST(지난 주). 월요일 09:00 머지 발송.');
}
