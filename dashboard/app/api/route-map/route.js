import { requireAuth } from '@/lib/auth-helper';
import pool from '@/lib/db';
import { getDefaultCar } from '@/lib/queries/car';
import { haversineMeters } from '@/lib/geo';

export const dynamic = 'force-dynamic';

// ⚠️  수정 전 필독: /CLAUDE.md "알려진 함정 — /api/route-map LRU 캐시 변수명" 섹션.
//     cacheSet 의 eviction 조건은 반드시 `cache.size > CACHE_CAPACITY` (변수명 오타시
//     eviction 미작동 → unbounded → 5xx).

// ── 모듈 스코프 LRU 캐시 ───────────────────────────────────
// drive는 종료 후 positions가 불변이므로 영구 캐시 가능. 메모리 보호용 LRU만 적용.
const CACHE_CAPACITY = 200;
const cache = new Map(); // key: `${driveId}|${detail}` → response object

function cacheGet(key) {
  if (!cache.has(key)) return null;
  const v = cache.get(key);
  cache.delete(key);
  cache.set(key, v); // promote (insertion order 갱신)
  return v;
}

function cacheSet(key, value) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_CAPACITY) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

// ── 거리 기반 thinning (light 모드) ──────────────────────
// 직전 보존 점에서 minMeters 이상 떨어진 점만 유지. 시작/끝점 보장.
function thinPositions(positions, minMeters = 5) {
  if (positions.length < 3) return positions;
  const out = [positions[0]];
  let lastLat = positions[0].lat, lastLng = positions[0].lng;
  for (let i = 1; i < positions.length - 1; i++) {
    const p = positions[i];
    if (haversineMeters({ lat: lastLat, lng: lastLng }, { lat: p.lat, lng: p.lng }) >= minMeters) {
      out.push(p);
      lastLat = p.lat;
      lastLng = p.lng;
    }
  }
  out.push(positions[positions.length - 1]);
  return out;
}

export async function GET(request) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  try {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get('driveId');
    const detail = searchParams.get('detail') === 'light' ? 'light' : 'full';
    let driveId = null;
    if (raw != null && raw !== '') {
      const parsed = parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return Response.json({ error: '유효하지 않은 driveId' }, { status: 400 });
      }
      driveId = parsed;
    }

    let driveInProgress = false;

    if (driveId == null) {
      const carResult = await getDefaultCar();
      if (!carResult) {
        return Response.json({ positions: [] });
      }
      const carId = carResult.id;

      const lastDrive = await pool.query(
        `SELECT id, end_date FROM drives WHERE car_id = $1 ORDER BY start_date DESC LIMIT 1`,
        [carId]
      );
      if (lastDrive.rows.length === 0) {
        return Response.json({ positions: [], driveId: null });
      }
      driveId = lastDrive.rows[0].id;
      driveInProgress = lastDrive.rows[0].end_date == null;
    } else {
      // 명시 driveId — 진행 중(end_date IS NULL) 여부 확인. 진행 중이면 캐시 우회
      // (positions 가 계속 추가되므로 첫 응답을 영구 보관하면 stale).
      const driveMeta = await pool.query(
        `SELECT end_date FROM drives WHERE id = $1`,
        [driveId]
      );
      driveInProgress = driveMeta.rows[0]?.end_date == null;
    }

    // 캐시 조회 — driveId 확정 후. 진행 중 drive 는 캐시 GET/SET 둘 다 우회.
    const cacheKey = `${driveId}|${detail}`;
    if (!driveInProgress) {
      const cached = cacheGet(cacheKey);
      if (cached) {
        return Response.json(cached);
      }
    }

    const posResult = await pool.query(
      `SELECT latitude, longitude, date, speed, elevation, outside_temp, inside_temp
       FROM positions
       WHERE drive_id = $1
       ORDER BY date ASC`,
      [driveId]
    );

    // 속도 통계 단일 패스 (전체 점 기준 — thinning 전에 계산)
    let total = 0, maxSpeed = -Infinity;
    let jam = 0, slow = 0, flow = 0, fast = 0;
    for (const p of posResult.rows) {
      if (p.speed == null) continue;
      const v = parseFloat(p.speed);
      if (!Number.isFinite(v)) continue;
      total++;
      if (v > maxSpeed) maxSpeed = v;
      if (v <= 30) jam++;
      else if (v <= 60) slow++;
      else if (v <= 80) flow++;
      else fast++;
    }
    const maxSpeedKmh = total > 0 ? Math.round(maxSpeed) : null;
    const speedBands = total > 0 ? {
      jam:  Math.round(jam  / total * 100),
      slow: Math.round(slow / total * 100),
      flow: Math.round(flow / total * 100),
      fast: Math.round(fast / total * 100),
    } : null;

    let positions = posResult.rows.map(p => ({
      lat: parseFloat(p.latitude),
      lng: parseFloat(p.longitude),
      date: p.date,
      speed: p.speed != null ? Math.round(parseFloat(p.speed)) : null,
      elev: p.elevation != null ? parseFloat(p.elevation) : null,
      temp: p.outside_temp != null ? parseFloat(p.outside_temp) : null,
    }));

    // light 모드: 5m 거리 기반 다운샘플 (지도 폴리라인 표시용)
    if (detail === 'light') {
      positions = thinPositions(positions, 5);
    }

    const payload = { driveId, positions, maxSpeedKmh, speedBands };
    if (!driveInProgress) cacheSet(cacheKey, payload);
    return Response.json(payload);
  } catch (err) {
    console.error('/api/route-map error:', err);
    return Response.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
