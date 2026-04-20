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
const DEFAULT_ZCODE = '41';
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

async function fetchPage(pageNo, key, { zcode, zscode }) {
  const url = new URL(BASE);
  url.searchParams.set('serviceKey', key);
  url.searchParams.set('pageNo', String(pageNo));
  url.searchParams.set('numOfRows', String(PAGE_SIZE));
  if (zscode) url.searchParams.set('zscode', zscode);
  else if (zcode) url.searchParams.set('zcode', zcode);
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
  const zcode = searchParams.get('zcode') || DEFAULT_ZCODE;
  const zscode = searchParams.get('zscode') || '';
  const addrFilter = (searchParams.get('addr') || '').trim();
  const nameFilter = (searchParams.get('name') || '').trim();
  const manualLat = Number(searchParams.get('lat'));
  const manualLng = Number(searchParams.get('lng'));
  const useGps = Number.isFinite(manualLat) && Number.isFinite(manualLng);

  try {
    // 지역코드로 1차 필터링 후 페이지 스캔 (zscode 지정 시 보통 1페이지로 충분)
    const allItems = [];
    let apiCalls = 0;
    for (let p = 1; p <= MAX_PAGES; p++) {
      try {
        const items = await fetchPage(p, key, { zcode, zscode });
        apiCalls += 1;
        if (!items.length) break;
        allItems.push(...items);
        if (items.length < PAGE_SIZE) break; // 더 이상 페이지 없음
      } catch (e) {
        return jsonUtf8({ error: `page ${p} 실패: ${e.message}`, apiCalls }, { status: 500 });
      }
    }

    // 스테이션별 집계 (필터는 후처리 — base는 반드시 포함되어야 함)
    const byStat = new Map();
    for (const it of allItems) {
      if (!it.statId) continue;
      const combinedAddr = [it.addr, it.addrDetail].filter(v => v && v !== 'null').join(' ');
      if (!byStat.has(it.statId)) {
        byStat.set(it.statId, {
          statId: it.statId, statNm: it.statNm,
          addr: combinedAddr,
          lat: it.lat, lng: it.lng,
          busiNm: it.busiNm, count: 0, outputs: new Set(),
        });
      }
      const s = byStat.get(it.statId);
      s.count += 1;
      if (it.output) s.outputs.add(it.output);
    }

    let base;
    if (useGps) {
      base = {
        statId: null, statNm: `GPS(${manualLat},${manualLng})`,
        addr: null, lat: manualLat, lng: manualLng, count: 0,
      };
    } else {
      base = byStat.get(baseStatId);
      if (!base) {
        return jsonUtf8({
          error: `baseStatId=${baseStatId} not found in zcode=${zcode}${zscode ? ` zscode=${zscode}` : ''}`,
          apiCalls,
          hint: '? lat=37.xx&lng=127.xx 로 GPS 검색하거나 ?zscode=... 로 지역 좁히기',
          sampleStatIds: Array.from(byStat.keys()).slice(0, 20),
        }, { status: 404 });
      }
    }

    const candidates = [];
    // 같은 주소(단지) 내 다른 스테이션 식별 — addr 앞부분(도로명까지) 매칭
    const baseAddrKey = (base.addr || '').split(/\s+/).slice(0, 4).join(' ').trim();
    const sameAddress = [];
    const passesFilter = (s) => {
      if (addrFilter && !(s.addr || '').includes(addrFilter)) return false;
      if (nameFilter && !(s.statNm || '').includes(nameFilter)) return false;
      return true;
    };
    for (const s of byStat.values()) {
      if (!useGps && s.statId === baseStatId) continue;
      // 같은 단지 (addr/name 필터 무시 — 항상 표시)
      const addrKey = (s.addr || '').split(/\s+/).slice(0, 4).join(' ').trim();
      if (baseAddrKey && addrKey === baseAddrKey) {
        sameAddress.push({
          statId: s.statId,
          statNm: s.statNm,
          addr: s.addr,
          busiNm: s.busiNm,
          count: s.count,
          outputs: [...s.outputs].join(','),
        });
      }
      // 반경/필터 기반 후보
      if (!s.lat || !s.lng) continue;
      if (!passesFilter(s)) continue;
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
    sameAddress.sort((a, b) => b.count - a.count);

    return jsonUtf8({
      query: { zcode, zscode: zscode || null, addr: addrFilter || null, name: nameFilter || null, radiusM, targetCount, apiCalls },
      base: {
        statId: base.statId, statNm: base.statNm,
        addr: base.addr, lat: base.lat, lng: base.lng, count: base.count,
      },
      baseAddrKey,
      sameAddressCount: sameAddress.length,
      sameAddress,
      totalCandidates: candidates.length,
      matched: candidates.filter(c => c.match),
      nearby: candidates,
    });
  } catch (e) {
    return jsonUtf8({ error: e.message }, { status: 500 });
  }
}
