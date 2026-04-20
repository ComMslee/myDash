#!/usr/bin/env node
// 집충전기 주변 스테이션 탐색 스크립트 (1회성)
// 사용법:
//   EV_CHARGER_API_KEY=... node scripts/find-nearby-chargers.js [baseStatId] [radiusM] [targetCount]
// 기본값: baseStatId=PI795111, radiusM=500, targetCount=12

const BASE = 'https://apis.data.go.kr/B552584/EvCharger/getChargerInfo';
const ZCODE = '41';
const MAX_PAGES = 10;
const PAGE_SIZE = 9999;

function haversineM(a, b) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat), la2 = toRad(b.lat);
  const x = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function parseItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) {
    const body = m[1];
    const get = (tag) => {
      const r = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(body);
      return r ? r[1].trim() : '';
    };
    items.push({
      statId: get('statId'),
      statNm: get('statNm'),
      chgerId: get('chgerId'),
      addr: get('addr'),
      addrDetail: get('addrDetail'),
      lat: Number(get('lat')) || null,
      lng: Number(get('lng')) || null,
      output: get('output'),
    });
  }
  return items;
}

async function fetchPage(pageNo, key) {
  const url = new URL(BASE);
  url.searchParams.set('serviceKey', key);
  url.searchParams.set('pageNo', String(pageNo));
  url.searchParams.set('numOfRows', String(PAGE_SIZE));
  url.searchParams.set('zcode', ZCODE);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`page ${pageNo} HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const key = process.env.EV_CHARGER_API_KEY;
  if (!key) {
    console.error('EV_CHARGER_API_KEY env var missing');
    process.exit(1);
  }
  const baseStatId = process.argv[2] || process.env.HOME_CHARGER_STAT_ID || 'PI795111';
  const radiusM = Number(process.argv[3]) || 500;
  const targetCount = Number(process.argv[4]) || 12;

  console.log(`[search] base=${baseStatId} radius=${radiusM}m target=${targetCount}기 zcode=${ZCODE}`);

  const all = [];
  for (let p = 1; p <= MAX_PAGES; p++) {
    try {
      const items = parseItems(await fetchPage(p, key));
      if (items.length === 0) break;
      all.push(...items);
      console.log(`  page ${p}: +${items.length} (total ${all.length})`);
    } catch (e) {
      console.warn(`  page ${p} failed: ${e.message}`);
    }
  }

  const byStat = new Map();
  for (const it of all) {
    if (!it.statId) continue;
    if (!byStat.has(it.statId)) {
      byStat.set(it.statId, {
        statId: it.statId,
        statNm: it.statNm,
        addr: [it.addr, it.addrDetail].filter(v => v && v !== 'null').join(' '),
        lat: it.lat,
        lng: it.lng,
        count: 0,
        outputs: [],
      });
    }
    const s = byStat.get(it.statId);
    s.count += 1;
    if (it.output) s.outputs.push(it.output);
  }

  const base = byStat.get(baseStatId);
  if (!base) {
    console.error(`\n[error] baseStatId=${baseStatId} not found in zcode=${ZCODE}. Check HOME_CHARGER_STAT_ID.`);
    process.exit(1);
  }
  console.log(`\n[base] ${base.statId}  ${base.statNm}  ${base.count}기  (${base.lat}, ${base.lng})  ${base.addr}`);

  const candidates = [];
  for (const s of byStat.values()) {
    if (s.statId === baseStatId) continue;
    if (!s.lat || !s.lng) continue;
    const d = haversineM(base, s);
    if (d <= radiusM) candidates.push({ ...s, distanceM: Math.round(d) });
  }
  candidates.sort((a, b) => a.distanceM - b.distanceM);

  console.log(`\n[nearby ≤${radiusM}m] (${candidates.length}개)`);
  for (const c of candidates) {
    const flag = c.count === targetCount ? ' ★' : '';
    const outputs = [...new Set(c.outputs)].join(',');
    console.log(`  ${c.statId}  ${String(c.count).padStart(3)}기  ${String(c.distanceM).padStart(4)}m  [${outputs}kW]  ${c.statNm} — ${c.addr}${flag}`);
  }

  const matched = candidates.filter(c => c.count === targetCount);
  console.log(`\n[${targetCount}기 매칭]: ${matched.length}개`);
  for (const t of matched) {
    console.log(`  → HOME_CHARGER_STAT_ID_2=${t.statId}  // ${t.statNm}, ${t.distanceM}m, ${t.addr}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
