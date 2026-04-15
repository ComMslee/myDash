// Kakao 역지오코딩 유틸리티 — PostgreSQL 캐시 사용
//
// 조회 순서:
//   1) DB 캐시 조회 → 있고 신선하면 반환
//   2) 캐시가 오래됐으면(STALE_DAYS 초과) API 재조회 후 갱신
//   3) 캐시 미스 → API 호출 → DB 저장
//
// 환경변수: KAKAO_REST_API_KEY

import pool from '@/lib/db';

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
const STALE_DAYS = 30; // 30일 지나면 API 재조회

// 캐시 테이블 초기화 (최초 1회)
let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kakao_address_cache (
      coord_key  TEXT PRIMARY KEY,
      label      TEXT,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  tableReady = true;
}

/**
 * Kakao API 호출 → 한국어 주소 문자열 반환 (실패 시 null)
 */
async function fetchFromKakao(lat, lng) {
  if (!KAKAO_KEY) return null;
  try {
    const url = `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}&input_coord=WGS84`;
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const doc = data.documents?.[0];
    if (!doc) return null;

    if (doc.road_address) {
      const r = doc.road_address;
      if (r.building_name) return r.building_name;
      const no = r.sub_building_no
        ? `${r.main_building_no}-${r.sub_building_no}`
        : r.main_building_no;
      return no ? `${r.road_name} ${no}` : r.road_name;
    }
    if (doc.address) {
      const a = doc.address;
      const no = a.sub_address_no
        ? `${a.main_address_no}-${a.sub_address_no}`
        : a.main_address_no;
      return no ? `${a.region_3depth_name} ${no}` : a.region_3depth_name;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 좌표 → 한국어 주소
 * DB 캐시 우선 조회, 오래됐으면 API 재조회 및 갱신
 */
export async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) return null;

  const coordKey = `${parseFloat(lat).toFixed(3)},${parseFloat(lng).toFixed(3)}`;

  try {
    await ensureTable();

    // DB 캐시 조회
    const cached = await pool.query(
      `SELECT label, updated_at FROM kakao_address_cache WHERE coord_key = $1`,
      [coordKey]
    );

    if (cached.rows.length > 0) {
      const row = cached.rows[0];
      const ageMs = Date.now() - new Date(row.updated_at).getTime();
      const staleDays = ageMs / (1000 * 60 * 60 * 24);

      // 신선한 캐시 → 즉시 반환
      if (staleDays < STALE_DAYS) {
        return row.label;
      }

      // 오래된 캐시 → API 재조회 후 갱신 (실패 시 기존 값 유지)
      const fresh = await fetchFromKakao(lat, lng);
      const newLabel = fresh !== null ? fresh : row.label;
      await pool.query(
        `UPDATE kakao_address_cache SET label = $1, updated_at = now() WHERE coord_key = $2`,
        [newLabel, coordKey]
      );
      return newLabel;
    }

    // 캐시 미스 → API 호출 → DB 저장
    const label = await fetchFromKakao(lat, lng);
    await pool.query(
      `INSERT INTO kakao_address_cache (coord_key, label)
       VALUES ($1, $2)
       ON CONFLICT (coord_key) DO UPDATE SET label = $2, updated_at = now()`,
      [coordKey, label]
    );
    return label;
  } catch (err) {
    console.error('[kakao-geo] error:', err.message);
    return null;
  }
}

/**
 * 여러 좌표를 병렬로 역지오코딩 (concurrency 제한)
 */
export async function batchReverseGeocode(coords, concurrency = 5) {
  const results = new Array(coords.length).fill(null);
  for (let i = 0; i < coords.length; i += concurrency) {
    const batch = coords.slice(i, i + concurrency);
    const labels = await Promise.all(
      batch.map(({ lat, lng }) => reverseGeocode(lat, lng))
    );
    labels.forEach((label, j) => { results[i + j] = label; });
  }
  return results;
}
