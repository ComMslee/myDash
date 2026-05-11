import { getUpdates } from './telegram.js';
import { handleMessage, handleCallback } from './commands.js';
import { getState, setState } from './state.js';

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
          if (u.message) await handleMessage(u.message);
          else if (u.callback_query) await handleCallback(u.callback_query);
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
