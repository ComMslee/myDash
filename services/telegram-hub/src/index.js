import { loadState } from './state.js';
import { startHttpServer } from './notify.js';
import { startDbPoller } from './poller.js';
import { startTelegramPoller } from './tg_poller.js';

const required = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TM_DB_USER', 'TM_DB_PASS'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error('[boot] missing env:', missing.join(', '));
  process.exit(1);
}

loadState();
startHttpServer();
startDbPoller();
startTelegramPoller();

console.log('[boot] telegram-hub ready');

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
