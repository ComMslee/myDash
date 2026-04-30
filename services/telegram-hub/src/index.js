import { loadState } from './state.js';
import { startHttpServer } from './notify.js';
import { startDbPoller } from './poller.js';
import { startTelegramPoller } from './tg_poller.js';
import { bootstrapRoot, grantPermission, syncMissingNames } from './auth.js';
import { ensureCategoriesSchema } from './categories.js';
import { ensureUserGroupsSchema } from './user_groups.js';
import { syncUserMenu } from './commands.js';

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
  await ensureUserGroupsSchema();
  // name=NULL 사용자(특히 env 부트스트랩 root) 텔레그램에서 이름 가져와 채움.
  syncMissingNames()
    .then((n) => n && console.log('[boot] syncMissingNames checked', n, 'user(s)'))
    .catch((e) => console.error('[boot] syncMissingNames failed', e.message));
  // root 의 텔레그램 [/] 메뉴 등록 — 그룹·권한 변동 후 항상 최신.
  syncUserMenu(rootChatId)
    .then(() => console.log('[boot] root menu synced'))
    .catch((e) => console.error('[boot] syncUserMenu failed', e.message));
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
