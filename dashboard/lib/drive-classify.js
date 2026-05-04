// 주행 분류 — chain 식별 + tag (이동주차 / 일반 / 외출) + 도착 후 stash 흡수.
// /api/drives 응답의 recent_drives 에 tag/chain_id/chain_legs/absorbed 부착.
//
// 분류 룰:
//   chain 식별 — gap < 10분 → 같은 chain (= 끊김 없는 연속 주행, hop-off 한정).
//                10분 이상 머무름 = 별개 외출 (휴게소·식사·충전 모두 분리).
//   chain leg ≥ 2  → '외출' (각 leg = 경유)
//   chain leg = 1
//     km < 0.5 AND start≈end                 → '이동주차'
//     km < 1.0 AND 분 < 5 AND start≈end      → '이동주차'
//     그 외                                  → '일반'
//   start≈end 판정: geofence 이름 일치 OR 좌표 ≤ 100m
//
// 도착 후 stash 흡수 (absorbed):
//   "도착 → 잠깐조정 → 최종 P" 패턴을 한 도착 이벤트로 취급.
//   stash 의 직전 비-stash 주행이 같은 위치에서 끝났고 gap ≤ 30분이면 absorbed=true.
//   UI 는 absorbed 인 stash 를 list 에서 숨김 (= 부모 drive 안으로 흡수).
//   효과: chain leg 사이에 끼인 stash 가 제거되어 외출 chain 이 끊기지 않음.

const SAME_LOC_M = 100;
const CHAIN_GAP_MAX_MIN = 10;
const MIN_DRIVE_KM = 0.5;
const MIN_DRIVE_MIN = 5;
const ABSORB_GAP_MAX_MIN = 30;

function distanceMeters(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return Infinity;
  const a1 = Number(lat1), o1 = Number(lng1), a2 = Number(lat2), o2 = Number(lng2);
  if (![a1, o1, a2, o2].every(Number.isFinite)) return Infinity;
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(a2 - a1);
  const dLng = toRad(o2 - o1);
  const h = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(a1)) * Math.cos(toRad(a2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 같은 위치 판정 — geofence 이름 일치 OR 좌표 거리 ≤ SAME_LOC_M.
// "집→집" 같이 같은 geofence 안에서 0.8km 이동도 sameLoc 으로 인식.
function sameLocOf(d) {
  if (d.start_geofence_name && d.end_geofence_name
      && d.start_geofence_name === d.end_geofence_name) return true;
  return distanceMeters(d.start_lat, d.start_lng, d.end_lat, d.end_lng) <= SAME_LOC_M;
}

function isStash(d) {
  const km = Number(d.distance) || 0;
  const min = Number(d.duration_min) || 0;
  if (!sameLocOf(d)) return false;
  if (km < MIN_DRIVE_KM) return true;
  if (km < 1.0 && min < MIN_DRIVE_MIN) return true;
  return false;
}

// rows: { id, start_date, end_date, distance, duration_min, start_lat, start_lng, end_lat, end_lng,
//         start_geofence_name, end_geofence_name }
// returns: Map<id, { tag, chain_id, chain_legs }>
export function classifyDrives(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return new Map();
  const asc = rows.slice().sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  );

  // 1) 이동주차 후보 — chain 합류 자격 박탈 (단독 처리).
  //    chain 묶기 전에 먼저 분리해야 "외출 끝 + 한참 후 차 옮김" 케이스가
  //    chain 의 leg 로 잘못 흡수되지 않음.
  const stashIds = new Set();
  for (const d of asc) if (isStash(d)) stashIds.add(d.id);

  // 2) 이동주차 외 drives 끼리만 chain 식별 — gap < 10분 (= hop-off) 만 같은 chain.
  const normals = asc.filter((d) => !stashIds.has(d.id));
  const chainOf = new Map();
  let cur = 0;
  for (let i = 0; i < normals.length; i++) {
    if (i === 0) { chainOf.set(normals[i].id, cur); continue; }
    const prev = normals[i - 1];
    const here = normals[i];
    const gapMin = (new Date(here.start_date).getTime() - new Date(prev.end_date).getTime()) / 60000;
    if (gapMin < CHAIN_GAP_MAX_MIN) chainOf.set(here.id, cur);
    else { cur += 1; chainOf.set(here.id, cur); }
  }
  // 이동주차도 각자 별도 chain id (single).
  for (const id of stashIds) chainOf.set(id, ++cur);

  // 3) chain → leg 수
  const legCount = new Map();
  for (const cid of chainOf.values()) legCount.set(cid, (legCount.get(cid) || 0) + 1);

  // 4) tag
  const out = new Map();
  for (const d of asc) {
    const cid = chainOf.get(d.id);
    const legs = legCount.get(cid);
    if (stashIds.has(d.id)) {
      out.set(d.id, { tag: '이동주차', chain_id: cid, chain_legs: legs, absorbed: false, absorbed_by: null });
    } else if (legs >= 2) {
      out.set(d.id, { tag: '외출', chain_id: cid, chain_legs: legs, absorbed: false, absorbed_by: null });
    } else {
      out.set(d.id, { tag: '일반', chain_id: cid, chain_legs: legs, absorbed: false, absorbed_by: null });
    }
  }

  // 5) 도착 후 stash 흡수 — 직전 비-stash 주행과 sameLoc + gap ≤ 30분 → absorbed.
  //    여러 stash 가 연속이면 모두 같은 부모 (가장 최근 비-stash) 에 귀속.
  for (let idx = 0; idx < asc.length; idx++) {
    const d = asc[idx];
    if (!stashIds.has(d.id)) continue;
    let prevIdx = idx - 1;
    while (prevIdx >= 0 && stashIds.has(asc[prevIdx].id)) prevIdx--;
    if (prevIdx < 0) continue;
    const prev = asc[prevIdx];
    const gapMin = (new Date(d.start_date).getTime() - new Date(prev.end_date).getTime()) / 60000;
    if (gapMin < 0 || gapMin > ABSORB_GAP_MAX_MIN) continue;
    const sameLoc = (prev.end_geofence_name && d.start_geofence_name
                    && prev.end_geofence_name === d.start_geofence_name)
                 || distanceMeters(prev.end_lat, prev.end_lng, d.start_lat, d.start_lng) <= SAME_LOC_M;
    if (!sameLoc) continue;
    const tagInfo = out.get(d.id);
    tagInfo.absorbed = true;
    tagInfo.absorbed_by = prev.id;
  }

  return out;
}
