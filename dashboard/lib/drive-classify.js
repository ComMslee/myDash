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
// 인접 stash 흡수 (absorbed) — 양방향:
//   "도착→잠깐조정→최종P" (arrival), "출발준비 stash→출발" (departure) 모두 한 이벤트로 취급.
//   연속된 stash 들을 클러스터로 묶고, 클러스터 양 끝에서:
//     - 직전 비-stash 주행이 sameLoc 에서 끝났고 gap ≤ 30분 → 도착 흡수
//     - 직후 비-stash 주행이 sameLoc 에서 시작하고 gap ≤ 30분 → 출발 흡수
//   둘 중 하나라도 매치되면 클러스터 전체 absorbed=true (부모 = 그 비-stash drive).
//   UI 는 absorbed stash 를 list 에서 숨김 → 부모 drive 안으로 흡수.
//   효과: chain leg 사이/시작/끝에 끼인 stash 가 사라져 외출 chain 이 정상적으로 묶임.

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

  // 5) 인접 stash 흡수 (양방향 클러스터) — 직전 도착 또는 직후 출발 비-stash 와 sameLoc + gap ≤ 30분.
  //    매치되면 클러스터 전체 absorbed=true.
  const sameLocBetween = (aLat, aLng, aGeo, bLat, bLng, bGeo) =>
    (aGeo && bGeo && aGeo === bGeo)
    || distanceMeters(aLat, aLng, bLat, bLng) <= SAME_LOC_M;

  let i2 = 0;
  while (i2 < asc.length) {
    if (!stashIds.has(asc[i2].id)) { i2++; continue; }
    // 클러스터 [i2 .. endIdx]
    let endIdx = i2;
    while (endIdx + 1 < asc.length && stashIds.has(asc[endIdx + 1].id)) endIdx++;
    const first = asc[i2];
    const last = asc[endIdx];

    let parent = null;
    // 도착 흡수 — prev 비-stash 주행
    const prevIdx = i2 - 1; // 클러스터 직전 = 항상 비-stash (또는 음수)
    if (prevIdx >= 0) {
      const prev = asc[prevIdx];
      const gapMin = (new Date(first.start_date).getTime() - new Date(prev.end_date).getTime()) / 60000;
      if (gapMin >= 0 && gapMin <= ABSORB_GAP_MAX_MIN
          && sameLocBetween(prev.end_lat, prev.end_lng, prev.end_geofence_name,
                            first.start_lat, first.start_lng, first.start_geofence_name)) {
        parent = prev;
      }
    }
    // 출발 흡수 — next 비-stash 주행
    if (!parent && endIdx + 1 < asc.length) {
      const next = asc[endIdx + 1];
      const gapMin = (new Date(next.start_date).getTime() - new Date(last.end_date).getTime()) / 60000;
      if (gapMin >= 0 && gapMin <= ABSORB_GAP_MAX_MIN
          && sameLocBetween(next.start_lat, next.start_lng, next.start_geofence_name,
                            last.end_lat, last.end_lng, last.end_geofence_name)) {
        parent = next;
      }
    }
    if (parent) {
      for (let k = i2; k <= endIdx; k++) {
        const tagInfo = out.get(asc[k].id);
        tagInfo.absorbed = true;
        tagInfo.absorbed_by = parent.id;
      }
    }
    i2 = endIdx + 1;
  }

  return out;
}
