// 가족·축제 명령 핸들러 — /weather /forecast /event /memo /festivals /setarea

import { sendMessage, escapeHtml } from '../telegram.js';
import { formatKst } from '../format.js';
import { dashGet } from '../dash.js';
import { getDefaultAreaCode, setDefaultAreaCode } from '../auth.js';
import { ymdKstNow, weekendRangeKst, fmtYmdShort, fmtFestivalDates } from '../formatters.js';

// ── 축제 / 내지역 ──────────────────────────────────────
// 한국관광공사 TourAPI(searchFestival2) 래핑 — dashboard /api/family/festivals 가 단일 진실원.
// 봇은 dashGet 호출 + 포맷만. 외부 API 직접 호출 X (CLAUDE.md "데이터 경로" 원칙).

const AREA_NAMES = {
  '1':  '서울',  '2':  '인천',  '3':  '대전',  '4':  '대구',  '5':  '광주',
  '6':  '부산',  '7':  '울산',  '8':  '세종',  '31': '경기',  '32': '강원',
  '33': '충북',  '34': '충남',  '35': '경북',  '36': '경남',  '37': '전북',
  '38': '전남',  '39': '제주',
};
const AREA_CODE_BY_NAME = Object.fromEntries(
  Object.entries(AREA_NAMES).map(([code, name]) => [name, code]),
);
const AREA_CLEAR_TOKENS = new Set(['전국', 'all', 'none', 'clear', '없음', '해제']);

// ── family (mock) ────────────────────────────────────
// 인터페이스 검증용 placeholder. 실제 구현은 후속 PR.
export async function cmdWeather({ chatId }) {
  return sendMessage(
    [
      '🌤 <b>오늘 날씨</b> (mock)',
      '',
      '<i>기상청 단기예보 연동은 준비 중입니다.</i>',
      '<i>예정: 강수확률 / 기온 / 미세먼지 한 화면 요약</i>',
    ].join('\n'),
    chatId,
  );
}

export async function cmdForecast({ chatId }) {
  return sendMessage(
    [
      '🌧 <b>강수 사전 알림</b> (mock)',
      '',
      '<i>비/눈 1~2시간 전 자동 알림 — 가족 broadcast 예정.</i>',
      '<i>현재는 알림 폴러 미구현.</i>',
    ].join('\n'),
    chatId,
  );
}

export async function cmdEvent({ chatId }) {
  return sendMessage(
    [
      '📅 <b>일정 관리</b> (mock)',
      '',
      '<i>등록·조회·반복 일정 + 사전 알림 — 다단계 대화로 입력 예정.</i>',
      '<i>현재는 placeholder.</i>',
    ].join('\n'),
    chatId,
  );
}

export async function cmdMemo({ chatId }) {
  return sendMessage(
    [
      '📝 <b>메모/장보기</b> (mock)',
      '',
      '<i>가족 공유 메모 + 항목별 ✅ 완료 체크 예정.</i>',
      '<i>현재는 placeholder.</i>',
    ].join('\n'),
    chatId,
  );
}

function festivalsFollowUp(range, areaCode) {
  const otherRange = range === 'weekend' ? 'month' : 'weekend';
  const otherLabel = otherRange === 'weekend' ? '🗓 이번 주말' : '🗓 한 달';
  // 내 지역(or 빈) ↔ 전국 토글. areaCode 가 비면 "내 지역" 버튼 무의미 → 비활성 표시.
  return {
    reply_markup: {
      inline_keyboard: [[
        { text: '🔄', callback_data: `festivals:${range}:${areaCode}` },
        { text: otherLabel, callback_data: `festivals:${otherRange}:${areaCode}` },
        // 지역 토글 — areaCode 가 있으면 전국으로, 없으면 안내(설정 명령으로).
        areaCode
          ? { text: '🌍 전국', callback_data: `festivals:${range}:` }
          : { text: '🗺 /setarea', callback_data: `festivals:${range}:` },
      ]],
    },
  };
}

// /festivals [weekend|month] [지역명|전국]
export async function cmdFestivals({ chatId, args }) {
  const tokens = (args || '').trim().split(/\s+/).filter(Boolean);
  let range = 'month';
  let areaOverride; // undefined = use default, '' = nationwide, 'NN' = code
  for (const t of tokens) {
    const lc = t.toLowerCase();
    if (lc === 'weekend' || t === '주말') range = 'weekend';
    else if (lc === 'month' || t === '한달' || t === '한 달') range = 'month';
    else if (AREA_CLEAR_TOKENS.has(lc) || AREA_CLEAR_TOKENS.has(t)) areaOverride = '';
    else if (AREA_CODE_BY_NAME[t]) areaOverride = AREA_CODE_BY_NAME[t];
    else if (/^\d{1,2}$/.test(t) && AREA_NAMES[t]) areaOverride = t;
  }
  const areaCode = areaOverride !== undefined
    ? areaOverride
    : ((await getDefaultAreaCode(chatId)) || '');
  return showFestivals(chatId, { range, areaCode });
}

export async function showFestivals(chatId, { range, areaCode }) {
  let from, to;
  if (range === 'weekend') {
    ({ from, to } = weekendRangeKst());
  } else {
    from = ymdKstNow(0);
    to   = ymdKstNow(30);
  }
  const qs = new URLSearchParams({ from, to, size: '10' });
  if (areaCode) qs.set('areaCode', areaCode);
  const j = await dashGet(`/api/family/festivals?${qs.toString()}`);

  const rangeLabel = range === 'weekend' ? '이번 주말' : '한 달';
  const areaLabel  = areaCode ? AREA_NAMES[areaCode] || `지역 ${areaCode}` : '전국';

  if (!j || j.error) {
    return sendMessage(
      [
        `🎉 <b>축제 (${rangeLabel})</b> · ${areaLabel}`,
        '',
        '데이터를 가져오지 못했어요.',
        j?.error ? `<i>${escapeHtml(String(j.error)).slice(0, 120)}</i>` : '',
      ].filter(Boolean).join('\n'),
      chatId,
      festivalsFollowUp(range, areaCode),
    );
  }

  const list = Array.isArray(j.festivals) ? j.festivals : [];
  const lines = [
    `🎉 <b>축제 (${rangeLabel})</b> · ${areaLabel}`,
    `<i>${fmtYmdShort(from)} ~ ${fmtYmdShort(to)} · ${list.length}건${j.totalCount > list.length ? ` / 전체 ${j.totalCount}` : ''}</i>`,
    '',
  ];
  if (!list.length) {
    lines.push('<i>해당 기간/지역에 축제 정보가 없어요.</i>');
  } else {
    for (const f of list) {
      const title = escapeHtml(String(f.title || '?').slice(0, 50));
      const dates = fmtFestivalDates(f.startDate, f.endDate);
      const addr  = f.addr ? escapeHtml(String(f.addr).slice(0, 40)) : '';
      lines.push(`🎈 <b>${title}</b>`);
      lines.push(`   📅 ${dates}${addr ? ` · 📍 ${addr}` : ''}`);
    }
  }
  if (j.fetchedAt) {
    lines.push('');
    lines.push(`<i>업데이트: ${formatKst(j.fetchedAt)}${j.cached ? ' · 캐시' : ''}</i>`);
  }
  return sendMessage(lines.join('\n'), chatId, festivalsFollowUp(range, areaCode));
}

// /setarea [지역명|코드|전국]
export async function cmdSetArea({ chatId, args }) {
  const arg = (args || '').trim();
  if (!arg) {
    const current = await getDefaultAreaCode(chatId);
    const currentLabel = current ? (AREA_NAMES[current] || current) : '전국';
    const list = Object.entries(AREA_NAMES)
      .map(([code, name]) => `${name}(${code})`)
      .join(' · ');
    return sendMessage(
      [
        '🗺 <b>내 지역 설정</b>',
        '',
        `현재: <b>${currentLabel}</b>`,
        '',
        '사용법: <code>/setarea 서울</code> 또는 <code>/setarea 11</code>',
        '해제: <code>/setarea 전국</code>',
        '',
        '<b>지역 목록</b>',
        `<i>${list}</i>`,
      ].join('\n'),
      chatId,
    );
  }
  if (AREA_CLEAR_TOKENS.has(arg.toLowerCase()) || AREA_CLEAR_TOKENS.has(arg)) {
    await setDefaultAreaCode(chatId, null);
    return sendMessage('✅ 내 지역: <b>전국</b> (해제됨)', chatId);
  }
  let code = AREA_CODE_BY_NAME[arg];
  if (!code && /^\d{1,2}$/.test(arg) && AREA_NAMES[arg]) code = arg;
  if (!code) {
    return sendMessage(
      `❌ '${escapeHtml(arg)}' 는 인식 못 했어요. <code>/setarea</code> 로 목록 확인.`,
      chatId,
    );
  }
  await setDefaultAreaCode(chatId, code);
  return sendMessage(`✅ 내 지역: <b>${AREA_NAMES[code]}</b> (코드 ${code})`, chatId);
}
