import { pool, getCarId } from './db.js';
import { sendMessage, escapeHtml } from './telegram.js';
import { getState, setState } from './state.js';
import { formatDur } from './format.js';
import { getUsersWithFeature } from './auth.js';
import { dashGet } from './dash.js';

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
async function broadcast(text) {
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
  for (const r of recipients) {
    try { await sendMessage(text, r); } catch (e) { console.error('[poller] send', e.message); }
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
    const soc = r.start_battery_level != null ? ` (${r.start_battery_level}%부터)` : '';
    await broadcast(`⚡ <b>충전 시작</b>${soc}\n📍 ${escapeHtml(where)}`);
    setState({ last_charge_start_id: Number(r.id) });
  }
}

async function checkChargeEnd(carId) {
  const s = getState();
  const { rows } = await pool.query(
    `SELECT cp.id, cp.duration_min, cp.charge_energy_added,
            cp.start_battery_level, cp.end_battery_level,
            g.name AS geo_name, a.name AS addr_name,
            COALESCE(g.latitude, a.latitude)::float AS lat,
            COALESCE(g.longitude, a.longitude)::float AS lng
     FROM charging_processes cp
     LEFT JOIN geofences g ON g.id = cp.geofence_id
     LEFT JOIN addresses a ON a.id = cp.address_id
     WHERE cp.car_id = $1 AND cp.id > $2 AND cp.end_date IS NOT NULL
     ORDER BY cp.id ASC`,
    [carId, s.last_charge_end_id],
  );
  for (const r of rows) {
    const where = await resolveLabel(r.geo_name, r.addr_name, r.lat, r.lng);
    const kwhNum = Number(r.charge_energy_added);
    const kwh = Number.isFinite(kwhNum) ? kwhNum.toFixed(2) : '0.00';
    const dur = formatDur(r.duration_min);
    const socPart = (r.start_battery_level != null && r.end_battery_level != null)
      ? ` ${r.start_battery_level}% → ${r.end_battery_level}%`
      : '';
    await broadcast([
      `✅ <b>충전 완료</b>${socPart}`,
      `⚡ ${kwh} kWh · ${dur}`,
      `📍 ${escapeHtml(where)}`,
    ].join('\n'));
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
    const effPart = eff > 0 ? ` · ${eff.toFixed(0)} Wh/km` : '';
    await broadcast([
      '🚗 <b>주행 종료</b>',
      `${escapeHtml(start)} → ${escapeHtml(end)}`,
      `${km.toFixed(1)} km · ${dur}${effPart}`,
    ].join('\n'));
    setState({ last_drive_end_id: Number(r.id) });
  }
}
