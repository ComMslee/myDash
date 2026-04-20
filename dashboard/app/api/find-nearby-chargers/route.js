// 집충전기 주변 스테이션 탐색 임시 API (1회성 조사용)
// GET /api/find-nearby-chargers?base=PI795111&radius=1000&count=12

export const dynamic = 'force-dynamic';

function jsonUtf8(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

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
      addr: get('addr'),
      addrDetail: get('addrDetail'),
      lat: Number(get('lat')) || null,
      lng: Number(get('lng')) || null,
      output: get('output'),
      busiNm: get('busiNm'),
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
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const text = await res.text();
  const errMsg = /<errMsg>([^<]+)<\/errMsg>/.exec(text)?.[1]?.trim();
  if (errMsg && errMsg !== 'NORMAL SERVICE.') throw new Error(`API ${errMsg}`);
  return parseItems(text);
}

export async function GET(req) {
  const key = process.env.EV_CHARGER_API_KEY;
  if (!key) return jsonUtf8({ error: 'EV_CHARGER_API_KEY 미설정' }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const baseStatId = searchParams.get('base') || process.env.HOME_CHARGER_STAT_ID || 'PI795111';
  const radiusM = Number(searchParams.get('radius')) || 1000;
  const targetCount = Number(searchParams.get('count')) || 12;

  try {
    // 전 페이지 풀스캔 (1회성)
    const allItems = [];
    for (let p = 1; p <= MAX_PAGES; p++) {
      try {
        const items = await fetchPage(p, key);
        if (!items.length) break;
        allItems.push(...items);
      } catch (e) {
        return jsonUtf8({ error: `page ${p} 실패: ${e.message}` }, { status: 500 });
      }
    }

    // 스테이션별 집계
    const byStat = new Map();
    for (const it of allItems) {
      if (!it.statId) continue;
      if (!byStat.has(it.statId)) {
        byStat.set(it.statId, {
          statId: it.statId, statNm: it.statNm,
          addr: [it.addr, it.addrDetail].filter(v => v && v !== 'null').join(' '),
          lat: it.lat, lng: it.lng,
          busiNm: it.busiNm, count: 0, outputs: new Set(),
        });
      }
      const s = byStat.get(it.statId);
      s.count += 1;
      if (it.output) s.outputs.add(it.output);
    }

    const base = byStat.get(baseStatId);
    if (!base) {
      return jsonUtf8({
        error: `baseStatId=${baseStatId} not found in zcode=${ZCODE}`,
        sampleStatIds: Array.from(byStat.keys()).slice(0, 20),
      }, { status: 404 });
    }

    const candidates = [];
    for (const s of byStat.values()) {
      if (s.statId === baseStatId) continue;
      if (!s.lat || !s.lng) continue;
      const d = haversineM(base, s);
      if (d <= radiusM) {
        candidates.push({
          statId: s.statId,
          statNm: s.statNm,
          addr: s.addr,
          busiNm: s.busiNm,
          count: s.count,
          outputs: [...s.outputs].join(','),
          distanceM: Math.round(d),
          match: s.count === targetCount,
        });
      }
    }
    candidates.sort((a, b) => a.distanceM - b.distanceM);

    return jsonUtf8({
      base: {
        statId: base.statId, statNm: base.statNm,
        addr: base.addr, lat: base.lat, lng: base.lng, count: base.count,
      },
      radiusM,
      targetCount,
      totalCandidates: candidates.length,
      matched: candidates.filter(c => c.match),
      nearby: candidates,
    });
  } catch (e) {
    return jsonUtf8({ error: e.message }, { status: 500 });
  }
}
