// 카테고리(=feature) 카탈로그 — DB 기반 (hub_categories).
// 부팅 시 lazy create + 기본 'car' 시드. dashboard /v2/tg 에서 CRUD.
//
// 명령 핸들러는 코드(commands.js)에 묶여 있으므로, 새 카테고리를 만들어도
// 거기 자동으로 묶일 명령이 생기진 않는다. 새 카테고리는 (a) 방송 타깃
// (b) 새 명령을 코드에 추가할 때 미리 잡아두는 슬롯 용도.
import { pool } from './db.js';

let _schemaReady = false;
let _cache = [];
let _cacheAt = 0;
const TTL_MS = 5_000;

export async function ensureCategoriesSchema() {
  if (_schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hub_categories (
      key         TEXT PRIMARY KEY,
      label       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      sort_order  INT  NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // 기본 시드 — 이미 있으면 건드리지 않음(라벨/설명 변경한 사용자 보존).
  await pool.query(`
    INSERT INTO hub_categories (key, label, description, sort_order) VALUES
      ('car',    '🚗 차량',  '내 테슬라 상태/위치/충전',          0),
      ('family', '🏠 가족',  '날씨/일정/메모 (가족 공유, mock)',  5),
      ('common', '🧰 공통',  '전 사용자 공용 기능',                10),
      ('sns',    '📝 SNS',   '블로그 발행 (mock)',                 20)
    ON CONFLICT (key) DO NOTHING
  `);
  _schemaReady = true;
}

async function refresh() {
  await ensureCategoriesSchema();
  const { rows } = await pool.query(
    `SELECT key, label, description AS desc, sort_order
     FROM hub_categories ORDER BY sort_order, key`,
  );
  _cache = rows;
  _cacheAt = Date.now();
}

// 메인 진입점 — 항상 await 로 호출. 핸들러 시작부에서 한 번 워밍하면
// 이후 sync 헬퍼(categoryByKey, labelOf)가 같은 캐시를 본다.
export async function getCategories() {
  // _cacheAt === 0 미초기화 / TTL 만료 시 refresh. 빈 결과도 TTL 동안 캐시.
  if (!_cacheAt || Date.now() - _cacheAt > TTL_MS) await refresh();
  return _cache;
}

export function invalidateCategoriesCache() {
  _cacheAt = 0;
}

// sync — 캐시 워밍 후에만 정확. 미워밍 상태면 빈 결과.
export function categoryByKey(key) {
  return _cache.find((c) => c.key === key) || null;
}

export function labelOf(key) {
  return categoryByKey(key)?.label || key;
}
