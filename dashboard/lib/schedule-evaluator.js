import pool from '@/lib/db';
import { listSchedules, isPausedOn, listGeofences } from '@/lib/queries/schedules';
import { getWeatherAt } from '@/lib/weather';
import { KST_OFFSET_MS } from '@/lib/kst';

// 시간 = 트리거, 장소·날씨 = 필터.
// 매분 1회 평가: 시간 매칭 시 → 장소 필터 통과 → 날씨 필터 통과 → executeAction.
// 장소는 '머무는 동안(at)' 필터만 (이전 enter/exit 이벤트 모드는 제거).

function kstNow() {
  return new Date(Date.now() + KST_OFFSET_MS);
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

    // ─── 시간 트리거 (필수) ───────────────────
    if (!t.time) continue; // 시간 미설정 = 자동 안 함
    const tcfg = t.time;
    if (tcfg.hhmm && tcfg.hhmm !== hhmm) continue; // 시각 미일치 — 조용히 skip
    if (Array.isArray(tcfg.days) && tcfg.days.length > 0 && !tcfg.days.includes(dow)) continue;
    if (tcfg.skip_holidays && holiday) continue;
    if (tcfg.include_holidays === false && holiday) continue;

    // 디바운스 — last_run_at 이후 N분 미만이면 skip
    const debounceMin = (t.debounce_minutes != null) ? t.debounce_minutes : 5;
    if (s.last_run_at) {
      const sinceMs = Date.now() - new Date(s.last_run_at).getTime();
      if (sinceMs < debounceMin * 60_000) {
        decisions.push({ s, fire: false, reason: `디바운스 ${debounceMin}분 내` });
        skipped++; continue;
      }
    }

    // ─── 장소 필터 (시간 매칭 후) ────────────
    if (t.location) {
      const placeKey = t.location.place;
      if (placeKey !== curPlace) {
        decisions.push({ s, fire: false, reason: '장소 조건 미달' });
        skipped++; continue;
      }
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

    decisions.push({ s, fire: true, trigger_source: 'time' });
    fired++;
  }

  return { evaluated: schedules.length, fired, skipped, decisions };
}
