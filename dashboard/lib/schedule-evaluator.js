import pool from '@/lib/db';
import { listSchedules, isPausedOn, recentLocationEvents, listGeofences, getVehicleState } from '@/lib/queries/schedules';
import { getWeatherAt } from '@/lib/weather';

// 차량이 깨어있지 않은 상태 — Fleet API 호출 시 wake 비용($0.02 = 명령의 20배) 발생.
// wake_policy='never_wake' 인 스케줄은 이 상태일 때 silent skip (비용 0).
const SLEEPING_STATES = new Set(['asleep', 'offline']);

// 3축 조건 (시간/장소/날씨) 평가 + skip/공휴일/디바운스 처리.
// 평가 단위: 매분 1회. 통과 시 executeAction 호출.

function kstNow() {
  return new Date(Date.now() + 9 * 3600 * 1000);
}

function kstDateStr(d = kstNow()) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function kstHHMM(d = kstNow()) {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function kstDow(d = kstNow()) {
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][d.getUTCDay()];
}

// 공휴일 — dash_holidays 캐시 직조회 (KASI 호출은 /api/holidays 가 lazy 처리)
async function isHolidayKst(dateStr) {
  const ymd = dateStr.replace(/-/g, '');
  const r = await pool.query(
    `SELECT 1 FROM dash_holidays WHERE dateymd=$1 AND is_holiday=TRUE LIMIT 1`,
    [ymd],
  );
  return r.rowCount > 0;
}

async function vehicleLastPosition() {
  // TeslaMate positions — 최신 좌표 1건
  const r = await pool.query(
    `SELECT latitude AS lat, longitude AS lng, date
       FROM positions
      ORDER BY date DESC LIMIT 1`,
  );
  return r.rows[0] || null;
}

function distMeters(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function currentGeofenceKey(geofences, posLatLng) {
  if (!posLatLng) return null;
  for (const g of geofences) {
    const d = distMeters({ lat: g.lat, lng: g.lng }, posLatLng);
    if (d <= (g.radius_m || 100)) return g.kind === 'custom' ? `custom:${g.id}` : g.kind;
  }
  return 'outside';
}

export async function evaluateAll() {
  const schedules = await listSchedules();
  if (!schedules.length) return { evaluated: 0, fired: 0, skipped: 0 };
  const today = kstDateStr();
  const hhmm = kstHHMM();
  const dow = kstDow();
  const paused = await isPausedOn(today);
  const holiday = await isHolidayKst(today);
  const geofences = await listGeofences();
  const pos = await vehicleLastPosition();
  const curPlace = await currentGeofenceKey(geofences, pos);
  const recentEvents = await recentLocationEvents({ since_minutes: 2 });
  const vehicleState = await getVehicleState();
  const vehicleSleeping = SLEEPING_STATES.has(vehicleState);

  let fired = 0, skipped = 0;
  const decisions = [];
  for (const s of schedules) {
    if (!s.enabled) continue;
    if (s.mode === 'now') continue; // 즉시 모드는 자동 트리거 안 됨
    const t = s.trigger_config || {};
    const skipDates = Array.isArray(s.skip_dates) ? s.skip_dates : [];

    if (paused && s.apply_pause_mode) { decisions.push({ s, fire: false, reason: '휴무 모드' }); skipped++; continue; }
    if (skipDates.includes(today)) { decisions.push({ s, fire: false, reason: 'skip 일자' }); skipped++; continue; }
    if (s.valid_from && today < s.valid_from) { decisions.push({ s, fire: false, reason: 'valid_from 이전' }); skipped++; continue; }
    if (s.valid_until && today > s.valid_until) { decisions.push({ s, fire: false, reason: 'valid_until 이후' }); skipped++; continue; }

    // ─── 시간 축 ──────────────────────────────
    let timeOk = true; let timeUsed = false;
    if (t.time) {
      timeUsed = true;
      const cfg = t.time;
      if (cfg.hhmm && cfg.hhmm !== hhmm) timeOk = false;
      if (timeOk && Array.isArray(cfg.days) && cfg.days.length > 0 && !cfg.days.includes(dow)) timeOk = false;
      if (timeOk && cfg.skip_holidays && holiday) timeOk = false;
      if (timeOk && cfg.include_holidays === false && holiday) timeOk = false;
    }

    // ─── 장소 축 ──────────────────────────────
    let placeOk = true; let placeUsed = false; let isEvent = false;
    if (t.location) {
      placeUsed = true;
      const cfg = t.location;
      const placeKey = cfg.place; // 'home' | 'work' | 'outside' | `custom:${id}`
      if (cfg.event === 'enter' || cfg.event === 'exit') {
        isEvent = true;
        const matchKind = cfg.event;
        const targetGid = (placeKey.startsWith('custom:')) ? parseInt(placeKey.split(':')[1], 10) : null;
        const found = recentEvents.find((e) => {
          if (e.event_type !== matchKind) return false;
          if (targetGid != null) return e.geofence_id === targetGid;
          const g = geofences.find((x) => x.id === e.geofence_id);
          return g && (g.kind === placeKey);
        });
        if (!found) placeOk = false;
      } else {
        // 'at' (머무는 동안) — 현재 위치가 그 장소
        if (placeKey !== curPlace) placeOk = false;
      }
    }

    // 디바운스 — last_run_at 이후 N분 미만이면 skip
    const debounceMin = (t.debounce_minutes != null) ? t.debounce_minutes : 5;
    if (s.last_run_at) {
      const sinceMs = Date.now() - new Date(s.last_run_at).getTime();
      if (sinceMs < debounceMin * 60_000) {
        decisions.push({ s, fire: false, reason: `디바운스 ${debounceMin}분 내` });
        skipped++; continue;
      }
    }

    // 시간 축도 장소 축도 안 켜져있고 manual-only 면 자동 트리거 안 됨
    if (!timeUsed && !placeUsed) continue;
    // 이벤트 트리거가 아닌 시간 트리거인데 시간 매칭 실패 → 평범한 건너뜀 (로그 안 남김)
    if (timeUsed && !timeOk && !isEvent) continue;
    // 이벤트 트리거인데 이벤트 매칭 실패 → 평범한 건너뜀
    if (isEvent && !placeOk) continue;
    // 시간 매칭은 됐는데 장소 필터 실패 → 로그 남기는 skip
    if (timeUsed && timeOk && placeUsed && !placeOk) {
      decisions.push({ s, fire: false, reason: '장소 조건 미달' });
      skipped++; continue;
    }

    // ─── 날씨 축 ──────────────────────────────
    if (t.weather) {
      const w = t.weather;
      // 기준 좌표: 시간 트리거면 location 필터 좌표, 아니면 현재 좌표
      let lat = pos?.lat, lng = pos?.lng;
      if (t.location?.place === 'home' || t.location?.place === 'work') {
        const g = geofences.find((x) => x.kind === t.location.place);
        if (g) { lat = g.lat; lng = g.lng; }
      }
      if (lat == null || lng == null) {
        decisions.push({ s, fire: false, reason: '날씨 평가용 좌표 없음' });
        skipped++; continue;
      }
      const wx = await getWeatherAt(lat, lng);
      if (!wx.ok) {
        decisions.push({ s, fire: false, reason: `날씨 조회 실패: ${wx.error}` });
        skipped++; continue;
      }
      if (w.temp_max != null && wx.tempC != null && wx.tempC > w.temp_max) {
        decisions.push({ s, fire: false, reason: `외기 ${wx.tempC}°C > 조건 ${w.temp_max}°C` });
        skipped++; continue;
      }
      if (w.temp_min != null && wx.tempC != null && wx.tempC < w.temp_min) {
        decisions.push({ s, fire: false, reason: `외기 ${wx.tempC}°C < 조건 ${w.temp_min}°C` });
        skipped++; continue;
      }
      if (w.precip && wx.precipKind === 'none') {
        decisions.push({ s, fire: false, reason: `강수 조건 ${w.precip} — 현재 없음` });
        skipped++; continue;
      }
    }

    // 사전 게이팅 — wake_policy='never_wake' 인 스케줄은 차량이 잠자기/오프라인일 때 skip.
    // (Fleet API 호출 시 wake 비용 $0.02 = 명령의 20배 — 무의미한 wake 폭주 방지.)
    const wakePolicy = s.wake_policy || 'never_wake';
    if (vehicleSleeping && wakePolicy === 'never_wake') {
      decisions.push({ s, fire: false, reason: `차량 ${vehicleState} — wake 회피` });
      skipped++; continue;
    }

    decisions.push({ s, fire: true, trigger_source: isEvent ? 'location_event' : 'time' });
    fired++;
  }

  return { evaluated: schedules.length, fired, skipped, decisions };
}
