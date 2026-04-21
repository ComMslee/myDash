#!/usr/bin/env node
// 스테이션 이름으로 충전소 검색
// 사용법: EV_CHARGER_API_KEY=... node scripts/search-by-name.js [statNm] [zcode]
// 예시: node scripts/search-by-name.js 망포늘푸른벽산 41

const BASE = 'https://apis.data.go.kr/B552584/EvCharger/getChargerInfo';

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
      lat: get('lat'),
      lng: get('lng'),
      output: get('output'),
      chgerType: get('chgerType'),
    });
  }
  return items;
}

async function main() {
  const key = process.env.EV_CHARGER_API_KEY;
  if (!key) { console.error('EV_CHARGER_API_KEY missing'); process.exit(1); }

  const statNm = process.argv[2] || '망포늘푸른벽산';
  const zcode  = process.argv[3] || '41';

  console.log(`[search] statNm="${statNm}" zcode=${zcode}`);

  const url = new URL(`${BASE}`);
  url.searchParams.set('serviceKey', key);
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', '9999');
  url.searchParams.set('zcode', zcode);
  url.searchParams.set('statNm', statNm);

  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) { console.error(`HTTP ${res.status}`); process.exit(1); }
  const xml = await res.text();

  // totalCount 추출
  const tc = /<totalCount>(\d+)<\/totalCount>/.exec(xml);
  console.log(`totalCount: ${tc ? tc[1] : '?'}`);

  const items = parseItems(xml);

  // 스테이션별로 그룹핑
  const byStat = new Map();
  for (const it of items) {
    if (!it.statId) continue;
    if (!byStat.has(it.statId)) {
      byStat.set(it.statId, {
        statId: it.statId,
        statNm: it.statNm,
        addr: [it.addr, it.addrDetail].filter(v => v && v !== 'null').join(' '),
        lat: it.lat,
        lng: it.lng,
        count: 0,
        outputs: new Set(),
        types: new Set(),
      });
    }
    const s = byStat.get(it.statId);
    s.count++;
    if (it.output) s.outputs.add(it.output);
    if (it.chgerType) s.types.add(it.chgerType);
  }

  console.log(`\n[stations found: ${byStat.size}]`);
  for (const s of byStat.values()) {
    console.log(`  statId=${s.statId}  ${String(s.count).padStart(3)}기  (${s.lat||'-'}, ${s.lng||'-'})`);
    console.log(`    이름: ${s.statNm}`);
    console.log(`    주소: ${s.addr}`);
    console.log(`    출력: [${[...s.outputs].join(',')}kW]  타입: [${[...s.types].join(',')}]`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
