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
