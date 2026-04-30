import { loadState } from './state.js';
import { startHttpServer } from './notify.js';
import { startDbPoller } from './poller.js';
import { startTelegramPoller } from './tg_poller.js';
import { bootstrapRoot, grantPermission } from './auth.js';
import { ensureCategoriesSchema } from './categories.js';

const required = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TM_DB_USER', 'TM_DB_PASS'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error('[boot] missing env:', missing.join(', '));
  process.exit(1);
}

loadState();

// .env 의 TELEGRAM_CHAT_ID 를 root 로 강제 + 모든 feature 권한 자동 부여.
const rootChatId = String(process.env.TELEGRAM_CHAT_ID);
try {
  await ensureCategoriesSchema();
  await bootstrapRoot(rootChatId);
  await grantPermission(rootChatId, 'car');
  console.log('[boot] root chat_id =', rootChatId);
} catch (e) {
  console.error('[boot] auth bootstrap failed', e.message);
}

startHttpServer();
startDbPoller();
startTelegramPoller();

console.log('[boot] telegram-hub ready');

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
