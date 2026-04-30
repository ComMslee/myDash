import { pool, getCarId } from './db.js';
import { sendMessage, escapeHtml } from './telegram.js';
import { getState, setState } from './state.js';
import { formatDur } from './format.js';

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
            g.name AS geo_name, a.name AS addr_name
     FROM charging_processes cp
     LEFT JOIN geofences g ON g.id = cp.geofence_id
     LEFT JOIN addresses a ON a.id = cp.address_id
     WHERE cp.car_id = $1 AND cp.id > $2
     ORDER BY cp.id ASC`,
    [carId, s.last_charge_start_id],
  );
  for (const r of rows) {
    const where = r.geo_name || r.addr_name || '알 수 없음';
    const soc = r.start_battery_level != null ? ` (${r.start_battery_level}%부터)` : '';
    await sendMessage(`⚡ <b>충전 시작</b>${soc}\n📍 ${escapeHtml(where)}`);
    setState({ last_charge_start_id: Number(r.id) });
  }
}

async function checkChargeEnd(carId) {
  const s = getState();
  const { rows } = await pool.query(
    `SELECT cp.id, cp.duration_min, cp.charge_energy_added,
            cp.start_battery_level, cp.end_battery_level,
            g.name AS geo_name, a.name AS addr_name
     FROM charging_processes cp
     LEFT JOIN geofences g ON g.id = cp.geofence_id
     LEFT JOIN addresses a ON a.id = cp.address_id
     WHERE cp.car_id = $1 AND cp.id > $2 AND cp.end_date IS NOT NULL
     ORDER BY cp.id ASC`,
    [carId, s.last_charge_end_id],
  );
  for (const r of rows) {
    const where = r.geo_name || r.addr_name || '알 수 없음';
    const kwh = Number(r.charge_energy_added || 0).toFixed(2);
    const dur = formatDur(r.duration_min);
    const socPart = (r.start_battery_level != null && r.end_battery_level != null)
      ? ` ${r.start_battery_level}% → ${r.end_battery_level}%`
      : '';
    await sendMessage([
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
            sg.name AS start_geo, eg.name AS end_geo
     FROM drives d
     LEFT JOIN addresses sa ON sa.id = d.start_address_id
     LEFT JOIN addresses ea ON ea.id = d.end_address_id
     LEFT JOIN geofences sg ON sg.id = d.start_geofence_id
     LEFT JOIN geofences eg ON eg.id = d.end_geofence_id
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
    const start = r.start_geo || r.start_name || '?';
    const end = r.end_geo || r.end_name || '?';
    const dur = formatDur(r.duration_min);
    const rangeUsed =
      (Number(r.start_rated_range_km) || 0) - (Number(r.end_rated_range_km) || 0);
    const kwh = Math.max(0, rangeUsed * KWH_PER_KM);
    const eff = km > 0 ? (kwh * 1000) / km : 0;
    const effPart = eff > 0 ? ` · ${eff.toFixed(0)} Wh/km` : '';
    await sendMessage([
      '🚗 <b>주행 종료</b>',
      `${escapeHtml(start)} → ${escapeHtml(end)}`,
      `${km.toFixed(1)} km · ${dur}${effPart}`,
    ].join('\n'));
    setState({ last_drive_end_id: Number(r.id) });
  }
}
