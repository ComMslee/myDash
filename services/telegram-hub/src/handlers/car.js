// 차량 관련 봇 명령 핸들러 — /soc /period /where /chargers /places

import { sendMessage, sendLocation, escapeHtml } from '../telegram.js';
import { formatKst } from '../format.js';
import { dashGet } from '../dash.js';
import { fmtElapsed, fmtSecHm } from '../formatters.js';

// 자주 가는 곳 + 오래 머문 곳 TOP 3 — 집/회사 제외.
const PINNED_PLACES = new Set(['집', '회사', 'Home', 'Work']);

// 데이터 명령 응답 끝에 동봉할 inline 후속 액션 (1행 3버튼).
// 첫 칸은 항상 🔄 새로고침, 나머지 2칸은 응답 컨텍스트와 연관성 높은 후속 명령.
const FOLLOWUP = {
  soc:      [['🔄', 'cmd:soc'],      ['📍 위치', 'cmd:where'],    ['🔌 충전기', 'cmd:chargers']],
  where:    [['🔄', 'cmd:where'],    ['🗺 가는 곳', 'cmd:places'],['📊 요약', 'cmd:period']],
  period:   [['🔄', 'cmd:period'],   ['🔋 배터리', 'cmd:soc'],    ['🔌 충전기', 'cmd:chargers']],
  chargers: [['🔄', 'cmd:chargers'], ['🔋 배터리', 'cmd:soc'],    ['📊 요약', 'cmd:period']],
  places:   [['🔄', 'cmd:places'],   ['📍 위치', 'cmd:where'],    ['📊 요약', 'cmd:period']],
};

function followUp(cmdKey) {
  const set = FOLLOWUP[cmdKey];
  if (!set) return null;
  return {
    reply_markup: {
      inline_keyboard: [set.map(([text, callback_data]) => ({ text, callback_data }))],
    },
  };
}

// 배터리 + 거리 + 충전 통합 응답.
//   1행: 🔋 % (사용가능) · 🛣 km 남음 (예상)
//   2행: ⚡ 충전 중 (상세) | ⚡ 충전 중 아님 + 마지막 충전 기록
export async function cmdSoc({ chatId }) {
  const [car, ch] = await Promise.all([
    dashGet('/api/car'),
    dashGet('/api/charging-status'),
  ]);
  if (!car || car.error) return sendMessage('데이터를 가져오지 못했어요', chatId);
  if (car.battery_level == null) return sendMessage('포지션 데이터 없음', chatId);

  const usable = car.usable_battery_level != null && car.usable_battery_level !== car.battery_level
    ? `  <i>(사용가능 ${car.usable_battery_level}%)</i>`
    : '';
  const rated = car.rated_battery_range;
  const est = car.est_battery_range;

  // 1행: 배터리 % (큰 글씨)
  // 2행: 거리 (rated · 예상)
  // 3행~: 충전 상태
  const lines = [
    `🔋  <b>${car.battery_level}%</b>${usable}`,
  ];
  if (rated != null) {
    const estPart = est && est !== rated ? `  <i>(예상 ${est} km)</i>` : '';
    lines.push(`🛣  <b>${rated} km</b> 남음${estPart}`);
  }
  lines.push(''); // 충전 정보 사이 빈 줄

  if (ch?.charging) {
    // pg 가 NUMERIC 을 string 으로 줄 수 있어 Number 캐스트 후 NaN 가드 (CLAUDE.md 함정).
    const powerNum = ch.charger_power != null ? Number(ch.charger_power) : NaN;
    const power = Number.isFinite(powerNum) ? powerNum.toFixed(1) : null;
    const kwhNum = Number(ch.charge_energy_added);
    const kwh = Number.isFinite(kwhNum) ? kwhNum.toFixed(2) : '0.00';
    const startSoc = ch.start_battery_level ?? '?';
    const elapsedMin = ch.start_date
      ? Math.floor((Date.now() - new Date(ch.start_date).getTime()) / 60000)
      : null;
    const fb = ch.fallback ? ' <i>(폴백)</i>' : '';
    lines.push(`⚡  <b>충전 중</b>${fb}  ${startSoc}% → <b>${car.battery_level}%</b>`);
    const meta = [`📥 ${kwh} kWh`];
    if (power) meta.push(`${power} kW`);
    if (elapsedMin != null) meta.push(`${fmtElapsed(elapsedMin)} 경과`);
    lines.push(`<i>${meta.join(' · ')}</i>`);
  } else {
    lines.push(`⚡  충전 중 아님`);
    const last = car.last_charge;
    if (last) {
      lines.push(`<i>마지막: ${formatKst(last.end_date)}  ${last.soc_start ?? '?'}% → ${last.soc_end ?? '?'}%</i>`);
    }
  }

  if (car.last_seen) lines.push(`<i>업데이트: ${formatKst(car.last_seen)}</i>`);
  return sendMessage(lines.join('\n'), chatId, followUp('soc'));
}

// /parked 와 /where 통합 — 정차 중이면 장소·경과, 주행 중이면 시작 시각 + 현재 좌표 + 핀.
export async function cmdWhere({ chatId }) {
  const [park, loc] = await Promise.all([
    dashGet('/api/parked'),
    dashGet('/api/location'),
  ]);
  const parkErr = !park || park.error;
  const locErr  = !loc  || loc.error;
  if (parkErr && locErr) return sendMessage('데이터를 가져오지 못했어요', chatId);

  const lines = [];
  if (!parkErr && park.driving) {
    lines.push('🚗 <b>주행 중</b>');
    if (park.drive_started_at) lines.push(`<i>시작: ${formatKst(park.drive_started_at)}</i>`);
  } else if (!parkErr && park.parked) {
    const p = park.parked;
    lines.push(`🅿️ <b>${escapeHtml(p.place || '?')}</b>`);
    lines.push(`<i>정차: ${formatKst(p.end_date)} (${fmtElapsed(p.elapsed_min)} 전)</i>`);
  }

  let lat = null, lng = null;
  if (!locErr && loc.lat != null) {
    lat = Number(loc.lat); lng = Number(loc.lng);
    const latS = lat.toFixed(6);
    const lngS = lng.toFixed(6);
    const url = `https://maps.google.com/?q=${latS},${lngS}`;
    if (lines.length) lines.push('');
    lines.push(`📍 <a href="${url}">${latS}, ${lngS}</a>`);
    lines.push(`<i>업데이트: ${formatKst(loc.date)}</i>`);
  }

  if (!lines.length) return sendMessage('위치 데이터 없음', chatId, followUp('where'));

  await sendMessage(lines.join('\n'), chatId, followUp('where'));
  if (lat != null && lng != null) return sendLocation(lat, lng, chatId);
}

// 이번주·지난주·이번달 한 응답에 — 짧은 퀵뷰. 상세는 대시보드.
// 5구간 한 응답에 — km 와 전비만 (퀵뷰). 상세는 대시보드.
//   오늘 / 이번주(월~) / 저번주 / 이번달(=최근 4주 롤링) / 이전달(=직전 4주)
//   '이번달' 은 캘린더가 아닌 28일 롤링 — 월초 빈약 회피.
export async function cmdPeriod({ chatId }) {
  const j = await dashGet('/api/summary?range=multi');
  if (!j || j.error) return sendMessage('데이터를 가져오지 못했어요', chatId);

  const fmt = (key, label) => {
    const r = j[key];
    if (!r) return `<b>${label}</b>  -`;
    const d = r.drives || {};
    const km = Number(d.km);
    if (!Number.isFinite(km) || km <= 0) return `<b>${label}</b>  -`;
    const eff = Number(d.eff_wh_km);
    const effStr = Number.isFinite(eff) && eff > 0 ? ` · ${eff} Wh/km` : '';
    return `<b>${label}</b>  ${km.toFixed(0)} km${effStr}`;
  };

  const lines = [
    '<b>📊 요약</b>',
    '',
    fmt('today',           '오늘   '),
    fmt('this_week',       '이번주 '),
    fmt('last_week',       '저번주 '),
    fmt('rolling_4w',      '최근 4주'),
    fmt('prev_rolling_4w', '직전 4주'),
    '',
    '<i>최근 4주 = 28일 롤링 (월초 빈약 회피)</i>',
    '<i>상세는 대시보드 /v2 에서</i>',
  ];
  return sendMessage(lines.join('\n'), chatId, followUp('period'));
}

// 즐겨찾기 충전기 — 대시보드의 동별 그룹과 동일하게 묶어 한 줄 요약.
// 즐겨찾기(⭐ 4개)는 줄별로, 참고 그룹은 한 줄 압축.
// 그룹 정의 단일 진실원: dashboard constants.js → /api/home-charger/groups.
export async function cmdChargers({ chatId }) {
  const j = await dashGet('/api/home-charger/groups');
  if (!j || j.error) {
    return sendMessage(
      `🔌 충전기 데이터를 가져오지 못했어요\n<i>${escapeHtml(j?.error || '연결 오류').slice(0, 80)}</i>`,
      chatId,
      followUp('chargers'),
    );
  }
  if (!Array.isArray(j.groups) || !j.groups.length) {
    return sendMessage('🔌 등록된 충전기가 없어요', chatId, followUp('chargers'));
  }

  const fav = j.groups.filter((g) => g.favorite);
  const ref = j.groups.filter((g) => !g.favorite);

  const lines = ['🔌 <b>충전기</b>', ''];

  // 즐겨찾기 — 한 줄씩 상세
  for (const g of fav) {
    const icon = g.available > 0 ? '🟢' : (g.using > 0 ? '🔴' : '⚫');
    let line = `${icon} <b>${g.title}</b>  가용 ${g.available} · 충전중 ${g.using} / ${g.total}`;
    const extra = [];
    if (g.offline) extra.push(`오프라인 ${g.offline}`);
    if (g.maintain) extra.push(`점검 ${g.maintain}`);
    if (extra.length) line += `  <i>(${extra.join(', ')})</i>`;
    lines.push(line);
  }

  // 참고 그룹 — 한 줄에 압축. "105 가용 2/3 · 111 가용 1/3 · ..."
  if (ref.length) {
    lines.push('');
    lines.push('<i>' + ref.map((g) => `${g.title} ${g.available}/${g.total}`).join(' · ') + '</i>');
  }

  lines.push('');
  if (j.fetchedAt) lines.push(`<i>업데이트: ${formatKst(j.fetchedAt)}${j.stale ? ' · 캐시' : ''}</i>`);
  lines.push('<i>상세는 대시보드 /v2 에서</i>');
  return sendMessage(lines.join('\n'), chatId, followUp('chargers'));
}

// /places — 분기 진입 화면. 자주/오래 각각 10개를 inline 버튼으로 분리.
export async function cmdPlaces({ chatId }) {
  return sendMessage(
    [
      '🗺 <b>가는 곳</b> <i>(집·회사 제외)</i>',
      '',
      '어떤 기준으로 볼까요?',
    ].join('\n'),
    chatId,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '📍 자주가는 곳 TOP 10',  callback_data: 'places:freq' },
          { text: '⏱ 오래머문 곳 TOP 10', callback_data: 'places:dwell' },
        ]],
      },
    },
  );
}

// places:freq | places:dwell — 각각 10개 리스트 + 다른 종류로 전환 버튼.
export async function showFreqPlaces(chatId) {
  const j = await dashGet('/api/frequent-places');
  if (!j || j.error) return sendMessage('데이터를 가져오지 못했어요', chatId, placesNavKb('freq'));
  const top = (j.places || []).filter((p) => !PINNED_PLACES.has(p.geofence_name)).slice(0, 10);
  const cap = (s) => escapeHtml(String(s || '?').slice(0, 28));
  const lines = ['📍 <b>자주가는 곳 TOP 10</b> <i>(집·회사 제외)</i>', ''];
  if (!top.length) lines.push('<i>데이터 없음</i>');
  top.forEach((p, i) => {
    lines.push(`${String(i + 1).padStart(2, ' ')}. ${cap(p.label)} · ${p.visit_count}회`);
  });
  lines.push('');
  lines.push('<i>상세는 대시보드 /v2 에서</i>');
  return sendMessage(lines.join('\n'), chatId, placesNavKb('freq'));
}

export async function showDwellPlaces(chatId) {
  const j = await dashGet('/api/long-stay-places');
  if (!j || j.error) return sendMessage('데이터를 가져오지 못했어요', chatId, placesNavKb('dwell'));
  const top = (j.places || []).filter((p) => !PINNED_PLACES.has(p.geofence_name)).slice(0, 10);
  const cap = (s) => escapeHtml(String(s || '?').slice(0, 28));
  const lines = ['⏱ <b>오래머문 곳 TOP 10</b> <i>(집·회사 제외)</i>', ''];
  if (!top.length) lines.push('<i>데이터 없음</i>');
  top.forEach((p, i) => {
    lines.push(`${String(i + 1).padStart(2, ' ')}. ${cap(p.label)} · ${fmtSecHm(p.total_dwell_sec || p.max_dwell_sec || 0)}`);
  });
  lines.push('');
  lines.push('<i>상세는 대시보드 /v2 에서</i>');
  return sendMessage(lines.join('\n'), chatId, placesNavKb('dwell'));
}

// current = 현재 보고 있는 종류. 🔄 = 같은 종류 재실행, 다른 버튼 = 반대 종류.
export function placesNavKb(current) {
  const other = current === 'freq' ? 'dwell' : 'freq';
  const otherLabel = other === 'freq' ? '📍 자주가는 곳' : '⏱ 오래머문 곳';
  return {
    reply_markup: {
      inline_keyboard: [[
        { text: '🔄',          callback_data: `places:${current}` },
        { text: otherLabel,    callback_data: `places:${other}` },
      ]],
    },
  };
}
