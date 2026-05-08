import { pool, getCarId } from './db.js';
import { sendMessage, escapeHtml } from './telegram.js';
import { getState, setState } from './state.js';
import { formatDur } from './format.js';
import { getUsersWithFeature } from './auth.js';
import { dashGet } from './dash.js';

// 가족 봇이라 새벽 알림은 소리/진동 끔. 메시지는 도착하지만 깨우지 않음.
// 23시~06시 KST = quiet.
function isQuietKst() {
  const kstH = new Date(Date.now() + 9 * 3600 * 1000).getUTCHours();
  return kstH >= 23 || kstH < 6;
}

// dashboard 공개 URL (가족 폰에서 열리는 주소). 미설정이면 인라인 버튼 생략.
const DASH_PUBLIC = process.env.DASHBOARD_PUBLIC_URL || '';
function inlineButton(label, path) {
  if (!DASH_PUBLIC) return undefined;
  return { inline_keyboard: [[{ text: label, url: `${DASH_PUBLIC}${path}` }]] };
}

// 지오펜스/주소 이름이 모두 비면 좌표로 dashboard 의 Kakao 역지오코더 호출.
// dashboard 가 단일 진실원: addresses.name NULL 인 케이스를 Kakao 폴백으로 채움.
async function resolveLabel(geoName, addrName, lat, lng) {
  if (geoName) return geoName;
  if (addrName) return addrName;
  if (lat == null || lng == null) return '?';
  const r = await dashGet(`/api/resolve-address?lat=${lat}&lng=${lng}`);
  return r?.label || '?';
}

// 'car' feature 권한자 전원에게 발송 (root + 권한 부여된 user).
// opts: { reply_markup, force_notify } — quiet 시간엔 disable_notification 자동 적용.
async function broadcast(text, opts = {}) {
  let recipients = [];
  try {
    recipients = await getUsersWithFeature('car');
  } catch (e) {
    console.error('[poller] recipients lookup failed', e.message);
  }
  if (!recipients.length && process.env.TELEGRAM_CHAT_ID) {
    // 부트스트랩 직후 등 — 아직 hub_users 비어 있을 때 root 직접 발송.
    recipients = [String(process.env.TELEGRAM_CHAT_ID)];
  }
  const sendOpts = {};
  if (opts.reply_markup) sendOpts.reply_markup = opts.reply_markup;
  if (isQuietKst() && !opts.force_notify) sendOpts.disable_notification = true;
  for (const r of recipients) {
    try { await sendMessage(text, r, sendOpts); } catch (e) { console.error('[poller] send', e.message); }
  }
}

const INTERVAL_MS = Number(process.env.DB_POLL_MS || 5000);
const KWH_PER_KM = 0.150;
const MIN_DRIVE_KM = 0.5;

export function startDbPoller() {
  bootstrap()
    .then(() => {
      console.log('[poller] baselines:', getState());
      setInterval(tick, INTERVAL_MS);
      tick();
    })
    .catch((e) => console.error('[poller] bootstrap failed', e));
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    const carId = await getCarId();
    if (!carId) return;
    await checkChargeStart(carId);
    await checkChargeEnd(carId);
    await checkDriveEnd(carId);
  } catch (e) {
    console.error('[poller] tick error', e);
  } finally {
    running = false;
  }
}

async function bootstrap() {
  const s = getState();
  if (s.last_charge_start_id === 0) {
    const { rows } = await pool.query(
      'SELECT COALESCE(MAX(id), 0)::int AS m FROM charging_processes',
    );
    setState({ last_charge_start_id: rows[0].m });
  }
  if (s.last_charge_end_id === 0) {
    const { rows } = await pool.query(
      "SELECT COALESCE(MAX(id), 0)::int AS m FROM charging_processes WHERE end_date IS NOT NULL",
    );
    setState({ last_charge_end_id: rows[0].m });
  }
  if (s.last_drive_end_id === 0) {
    const { rows } = await pool.query(
      "SELECT COALESCE(MAX(id), 0)::int AS m FROM drives WHERE end_date IS NOT NULL",
    );
    setState({ last_drive_end_id: rows[0].m });
  }
}

async function checkChargeStart(carId) {
  const s = getState();
  const { rows } = await pool.query(
    `SELECT cp.id, cp.start_date, cp.start_battery_level,
            g.name AS geo_name, a.name AS addr_name,
            COALESCE(g.latitude, a.latitude)::float AS lat,
            COALESCE(g.longitude, a.longitude)::float AS lng
     FROM charging_processes cp
     LEFT JOIN geofences g ON g.id = cp.geofence_id
     LEFT JOIN addresses a ON a.id = cp.address_id
     WHERE cp.car_id = $1 AND cp.id > $2
     ORDER BY cp.id ASC`,
    [carId, s.last_charge_start_id],
  );
  for (const r of rows) {
    const where = await resolveLabel(r.geo_name, r.addr_name, r.lat, r.lng);
    const soc = r.start_battery_level != null ? ` ${r.start_battery_level}%` : '';
    await broadcast(`⚡ <b>충전 시작</b>${soc} · 📍 ${escapeHtml(where)}`);
    setState({ last_charge_start_id: Number(r.id) });
  }
}

async function checkChargeEnd(carId) {
  const s = getState();
  // charges JOIN 으로 fast_charger_present 집계 — 한 세션이라도 급속이면 ⚡급속 으로 간주.
  const { rows } = await pool.query(
    `SELECT cp.id, cp.duration_min, cp.charge_energy_added,
            cp.start_battery_level, cp.end_battery_level,
            g.name AS geo_name, a.name AS addr_name,
            COALESCE(g.latitude, a.latitude)::float AS lat,
            COALESCE(g.longitude, a.longitude)::float AS lng,
            COALESCE(BOOL_OR(c.fast_charger_present), false) AS is_fast
     FROM charging_processes cp
     LEFT JOIN geofences g ON g.id = cp.geofence_id
     LEFT JOIN addresses a ON a.id = cp.address_id
     LEFT JOIN charges c ON c.charging_process_id = cp.id
     WHERE cp.car_id = $1 AND cp.id > $2 AND cp.end_date IS NOT NULL
     GROUP BY cp.id, g.name, a.name, g.latitude, a.latitude, g.longitude, a.longitude
     ORDER BY cp.id ASC`,
    [carId, s.last_charge_end_id],
  );
  for (const r of rows) {
    const where = await resolveLabel(r.geo_name, r.addr_name, r.lat, r.lng);
    const kwhNum = Number(r.charge_energy_added);
    const kwh = Number.isFinite(kwhNum) ? kwhNum : 0;
    const dur = formatDur(r.duration_min);
    const hours = Math.max(1 / 60, Number(r.duration_min || 0) / 60);
    const avgKw = kwh > 0 ? (kwh / hours) : 0;
    const kmGained = kwh > 0 ? Math.round(kwh / KWH_PER_KM) : 0;
    const speedTag = r.is_fast ? '⚡ 급속' : '🔌 완속';

    // 충전된 양(SOC 델타·kWh·km)은 의미상 한 묶음 → 한 괄호로 묶기.
    const amountParts = [];
    if (r.start_battery_level != null && r.end_battery_level != null) {
      const delta = r.end_battery_level - r.start_battery_level;
      const sign = delta >= 0 ? '+' : '';
      amountParts.push(`${sign}${delta}%p`);
    }
    if (kwh > 0) amountParts.push(`${kwh.toFixed(2)}kWh`);
    if (kmGained > 0) amountParts.push(`${kmGained}km`);

    let header;
    if (r.start_battery_level != null && r.end_battery_level != null) {
      const tail = amountParts.length > 0 ? ` (${amountParts.join(', ')})` : '';
      header = `✅ ${r.start_battery_level}→${r.end_battery_level}%${tail} · ${speedTag}`;
    } else {
      const tail = amountParts.length > 0 ? ` ${amountParts.join(', ')}` : '';
      header = `✅ <b>충전 완료</b>${tail} · ${speedTag}`;
    }

    const meta = [`⏱️ ${dur}`];
    if (avgKw > 0) meta.push(`📈 ${avgKw.toFixed(1)}kW`);
    meta.push(`📍 ${escapeHtml(where)}`);

    const lines = [header, meta.join(' · ')];

    await broadcast(lines.join('\n'), {
      reply_markup: inlineButton('🔋 배터리 상세', '/v2/battery'),
    });
    setState({ last_charge_end_id: Number(r.id) });
  }
}

async function checkDriveEnd(carId) {
  const s = getState();
  const { rows } = await pool.query(
    `SELECT d.id, d.distance::float AS km, d.duration_min,
            d.start_rated_range_km, d.end_rated_range_km,
            sa.name AS start_name, ea.name AS end_name,
            sg.name AS start_geo, eg.name AS end_geo,
            sp.latitude::float  AS start_lat, sp.longitude::float AS start_lng,
            ep.latitude::float  AS end_lat,   ep.longitude::float AS end_lng
     FROM drives d
     LEFT JOIN addresses sa ON sa.id = d.start_address_id
     LEFT JOIN addresses ea ON ea.id = d.end_address_id
     LEFT JOIN geofences sg ON sg.id = d.start_geofence_id
     LEFT JOIN geofences eg ON eg.id = d.end_geofence_id
     LEFT JOIN positions sp ON sp.id = d.start_position_id
     LEFT JOIN positions ep ON ep.id = d.end_position_id
     WHERE d.car_id = $1 AND d.id > $2 AND d.end_date IS NOT NULL
     ORDER BY d.id ASC`,
    [carId, s.last_drive_end_id],
  );
  for (const r of rows) {
    const km = Number(r.km || 0);
    if (km < MIN_DRIVE_KM) {
      setState({ last_drive_end_id: Number(r.id) });
      continue;
    }
    const start = await resolveLabel(r.start_geo, r.start_name, r.start_lat, r.start_lng);
    const end   = await resolveLabel(r.end_geo,   r.end_name,   r.end_lat,   r.end_lng);
    const dur = formatDur(r.duration_min);
    const rangeUsed =
      (Number(r.start_rated_range_km) || 0) - (Number(r.end_rated_range_km) || 0);
    const kwh = Math.max(0, rangeUsed * KWH_PER_KM);
    const eff = km > 0 ? (kwh * 1000) / km : 0;
    const kmPerKwh = eff > 0 ? (1000 / eff) : 0;
    const effLine = eff > 0
      ? `\n⚡ ${eff.toFixed(0)}Wh/km · ${kmPerKwh.toFixed(1)}km/kWh`
      : '';
    await broadcast(
      [
        `🚗 ${escapeHtml(start)} → ${escapeHtml(end)}`,
        `🛣️ ${km.toFixed(1)}km · ⏱️ ${dur}${effLine}`,
      ].join('\n'),
      { reply_markup: inlineButton('🗺️ 지도 보기', `/v2/history?id=${r.id}`) },
    );
    setState({ last_drive_end_id: Number(r.id) });
  }
}
