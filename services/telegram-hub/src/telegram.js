const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEFAULT_CHAT = process.env.TELEGRAM_CHAT_ID;
const API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null;

export async function sendMessage(text, chatId = DEFAULT_CHAT, opts = {}) {
  if (!API || !chatId) {
    console.error('[telegram] missing TOKEN or chat_id');
    return null;
  }
  try {
    const r = await fetch(`${API}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...opts,
      }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error('[telegram] sendMessage', r.status, body);
      return null;
    }
    return await r.json();
  } catch (e) {
    console.error('[telegram] sendMessage threw', e);
    return null;
  }
}

export async function sendLocation(lat, lng, chatId = DEFAULT_CHAT) {
  if (!API || !chatId) return null;
  try {
    const r = await fetch(`${API}/sendLocation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, latitude: lat, longitude: lng }),
    });
    if (!r.ok) console.error('[telegram] sendLocation', r.status);
    return r.ok ? await r.json() : null;
  } catch (e) {
    console.error('[telegram] sendLocation threw', e);
    return null;
  }
}

// chat_id 만으로 텔레그램에서 first_name/last_name/username 조회.
// private chat 이면 first_name 보장. 봇이 한 번도 인터랙션 안 한 사용자엔 실패할 수 있음.
export async function getChat(chatId) {
  if (!API || !chatId) return null;
  try {
    const r = await fetch(`${API}/getChat?chat_id=${encodeURIComponent(chatId)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.result || null;
  } catch (e) {
    return null;
  }
}

// callback_query 응답 — inline 키보드 버튼 클릭 후 상단 로딩 끄기 + 옵션 토스트.
export async function answerCallbackQuery(callbackQueryId, text = null) {
  if (!API || !callbackQueryId) return null;
  try {
    const body = { callback_query_id: callbackQueryId };
    if (text) body.text = text;
    const r = await fetch(`${API}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) console.error('[telegram] answerCallbackQuery', r.status);
    return r.ok ? await r.json() : null;
  } catch (e) {
    console.error('[telegram] answerCallbackQuery threw', e?.message);
    return null;
  }
}

// 기존 메시지를 갈아끼움 — inline 키보드의 "새로고침"/"뒤로가기" 같은 흐름에 사용.
export async function editMessageText(text, chatId, messageId, opts = {}) {
  if (!API || !chatId || !messageId) return null;
  try {
    const r = await fetch(`${API}/editMessageText`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...opts,
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      // "message is not modified" 는 정상 (같은 내용으로 edit) — 디버그 노이즈 줄임.
      if (!t.includes('not modified')) console.error('[telegram] editMessageText', r.status, t);
      return null;
    }
    return await r.json();
  } catch (e) {
    console.error('[telegram] editMessageText threw', e?.message);
    return null;
  }
}

// 텔레그램 입력창 [/] 메뉴 자동완성 비우기 — 봇은 Reply 키보드 진입만 사용.
// chatId 미지정 시 전역 default 메뉴 삭제.
export async function deleteMyCommands(chatId = null, languageCode = 'ko') {
  if (!API) return null;
  const body = { language_code: languageCode };
  if (chatId) body.scope = { type: 'chat', chat_id: Number(chatId) };
  try {
    const r = await fetch(`${API}/deleteMyCommands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error('[telegram] deleteMyCommands', r.status, t);
      return null;
    }
    return await r.json();
  } catch (e) {
    console.error('[telegram] deleteMyCommands threw', e?.message);
    return null;
  }
}

export async function getUpdates(offset, timeoutSec = 25) {
  if (!API) return [];
  try {
    const url = `${API}/getUpdates?timeout=${timeoutSec}&offset=${offset}`;
    const r = await fetch(url, {
      signal: AbortSignal.timeout((timeoutSec + 10) * 1000),
    });
    if (!r.ok) {
      console.error('[telegram] getUpdates', r.status);
      return [];
    }
    const j = await r.json();
    return j.result || [];
  } catch (e) {
    if (e.name !== 'TimeoutError') console.error('[telegram] getUpdates threw', e.message || e);
    return [];
  }
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}
