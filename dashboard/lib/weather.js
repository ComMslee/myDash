// 기상청 단기예보 — 좌표 기반 외기온도/강수 조회 + 인메모리 캐시.
// 자동화 조건 평가에서 호출. ENV KMA_API_KEY 필요.
// 단순화: 사용자 좌표 1개 (집/회사 무관 가까운 격자) — 자동화 평가 시점의 외기.
// 캐시 TTL = 1시간 (단기예보 발표 간격에 맞춤).

import { KST_OFFSET_MS } from '@/lib/kst';

const KMA_ENDPOINT = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst';

const cache = new Map(); // key: "lat,lng" → { fetchedAt, data }
const TTL_MS = 60 * 60 * 1000;
// 좌표는 사용자 입력에 의해 사실상 무제한 — size cap 으로 메모리 누수 차단.
const CACHE_MAX = 200;

// 위경도 → 기상청 격자(nx, ny) 변환 (LCC 투영)
// 출처: 기상청 공식 변환 알고리즘.
export function toGrid(lat, lng) {
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;
  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lng * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;
  const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
  return { nx, ny };
}

// 기상청 발표 시각 라운딩 — 매시 정각에서 30분 전후 (안전하게 10분 전 시각)
function latestObsTime(d = new Date()) {
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  // 10분 마진
  const t = new Date(kst.getTime() - 10 * 60 * 1000);
  const yyyy = t.getUTCFullYear();
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(t.getUTCDate()).padStart(2, '0');
  const hh = String(t.getUTCHours()).padStart(2, '0');
  return { baseDate: `${yyyy}${mm}${dd}`, baseTime: `${hh}00` };
}

export async function getWeatherAt(lat, lng) {
  const apiKey = process.env.KMA_API_KEY || '';
  if (!apiKey) return { ok: false, error: 'KMA_API_KEY not set' };
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return { ok: true, ...cached.data, cached: true };
  if (cached) cache.delete(key); // 만료분 즉시 제거

  const { nx, ny } = toGrid(lat, lng);
  const { baseDate, baseTime } = latestObsTime();
  const url = new URL(KMA_ENDPOINT);
  url.searchParams.set('serviceKey', apiKey);
  url.searchParams.set('numOfRows', '50');
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('dataType', 'JSON');
  url.searchParams.set('base_date', baseDate);
  url.searchParams.set('base_time', baseTime);
  url.searchParams.set('nx', String(nx));
  url.searchParams.set('ny', String(ny));

  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
  } catch (e) {
    return { ok: false, error: e?.message || 'network' };
  }
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const json = await res.json().catch(() => null);
  const items = json?.response?.body?.items?.item || [];
  // PTY=강수형태(0:없음,1:비,2:비/눈,3:눈,5:빗방울,6:빗방울눈날림,7:눈날림)
  // T1H=기온  REH=습도  WSD=풍속
  const map = {};
  for (const it of items) map[it.category] = it.obsrValue;
  const tempC = parseFloat(map.T1H);
  const ptyCode = parseInt(map.PTY, 10);
  const wsdMs = parseFloat(map.WSD);
  const data = {
    tempC: Number.isFinite(tempC) ? tempC : null,
    ptyCode: Number.isFinite(ptyCode) ? ptyCode : 0,
    precipKind: { 0: 'none', 1: 'rain', 2: 'rain_snow', 3: 'snow', 5: 'drizzle', 6: 'drizzle_snow', 7: 'snow_flurry' }[ptyCode] || 'none',
    windMs: Number.isFinite(wsdMs) ? wsdMs : null,
    fetchedAt: Date.now(),
    baseDate, baseTime, nx, ny,
  };
  if (cache.size >= CACHE_MAX) {
    // 가장 오래 전에 삽입된 entry 1건 제거 (FIFO eviction)
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { fetchedAt: Date.now(), data });
  return { ok: true, ...data, cached: false };
}
