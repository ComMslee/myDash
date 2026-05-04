// 주행 분류 — chain 식별 + tag (이동주차 / 일반 / 외출).
// PoC: /api/drives 응답의 recent_drives 에 tag/chain_id/chain_legs 부착.
//
// 분류 룰:
//   chain 식별 — gap < 30분 OR (gap < 4시간 AND 위치 ≤ 100m) → 같은 chain
//   chain leg ≥ 2  → '외출' (각 leg = 경유 후보)
//   chain leg = 1
//     km < 0.5 AND start≈end                 → '이동주차'
//     km < 1.0 AND 분 < 5 AND start≈end      → '이동주차'
//     그 외                                  → '일반'

const SAME_LOC_M = 100;
const CHAIN_GAP_SHORT_MIN = 30;
const CHAIN_GAP_LONG_MIN = 240;
const MIN_DRIVE_KM = 0.5;
const MIN_DRIVE_MIN = 5;

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

// rows: { id, start_date, end_date, distance, duration_min, start_lat, start_lng, end_lat, end_lng }
// returns: Map<id, { tag, chain_id, chain_legs }>
export function classifyDrives(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return new Map();
  const asc = rows.slice().sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  );

  // 1) chain 식별
  const chainOf = new Map();
  let cur = 0;
  for (let i = 0; i < asc.length; i++) {
    if (i === 0) { chainOf.set(asc[i].id, cur); continue; }
    const prev = asc[i - 1];
    const here = asc[i];
    const gapMin = (new Date(here.start_date).getTime() - new Date(prev.end_date).getTime()) / 60000;
    const dM = distanceMeters(prev.end_lat, prev.end_lng, here.start_lat, here.start_lng);
    let same = false;
    if (gapMin < CHAIN_GAP_SHORT_MIN) same = true;
    else if (gapMin < CHAIN_GAP_LONG_MIN && dM <= SAME_LOC_M) same = true;
    if (same) chainOf.set(here.id, cur);
    else { cur += 1; chainOf.set(here.id, cur); }
  }

  // 2) chain → leg 수
  const legCount = new Map();
  for (const cid of chainOf.values()) legCount.set(cid, (legCount.get(cid) || 0) + 1);

  // 3) tag
  const out = new Map();
  for (const d of asc) {
    const cid = chainOf.get(d.id);
    const legs = legCount.get(cid);
    if (legs >= 2) {
      out.set(d.id, { tag: '외출', chain_id: cid, chain_legs: legs });
      continue;
    }
    const km = Number(d.distance) || 0;
    const min = Number(d.duration_min) || 0;
    const startEndDist = distanceMeters(d.start_lat, d.start_lng, d.end_lat, d.end_lng);
    const sameLoc = startEndDist <= SAME_LOC_M;
    let tag = '일반';
    if (km < MIN_DRIVE_KM && sameLoc) tag = '이동주차';
    else if (km < 1.0 && min < MIN_DRIVE_MIN && sameLoc) tag = '이동주차';
    out.set(d.id, { tag, chain_id: cid, chain_legs: legs });
  }
  return out;
}
