import { getUpdates } from './telegram.js';
import { handleCommand } from './commands.js';
import { getState, setState } from './state.js';

const ALLOWED_CHAT = String(process.env.TELEGRAM_CHAT_ID || '');

export function startTelegramPoller() {
  loop().catch((e) => console.error('[tg-poller] fatal', e));
}

async function loop() {
  while (true) {
    try {
      const s = getState();
      const updates = await getUpdates(s.telegram_offset);
      for (const u of updates) {
        const next = u.update_id + 1;
        try {
          const m = u.message;
          if (m && m.text && String(m.chat?.id) === ALLOWED_CHAT) {
            await handleCommand(m.text, m.chat.id);
          }
        } catch (e) {
          console.error('[tg-poller] handler error', e);
        } finally {
          setState({ telegram_offset: next });
        }
      }
    } catch (e) {
      console.error('[tg-poller] poll error', e);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
