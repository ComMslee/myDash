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

// 사용자별 텔레그램 입력창 [/] 메뉴 자동완성 갱신.
// commands: [{ command:'soc', description:'배터리 % + 충전 여부' }, ...] (앞에 / 없이)
// chatId 미지정 시 봇 전역 default 갱신.
export async function setMyCommands(commands, chatId = null, languageCode = 'ko') {
  if (!API) return null;
  const body = { commands, language_code: languageCode };
  if (chatId) body.scope = { type: 'chat', chat_id: Number(chatId) };
  try {
    const r = await fetch(`${API}/setMyCommands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error('[telegram] setMyCommands', r.status, t);
      return null;
    }
    return await r.json();
  } catch (e) {
    console.error('[telegram] setMyCommands threw', e?.message);
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
