// 운영 명령 핸들러 (rootOnly) — /pending /setgroup /deny

import { sendMessage, escapeHtml, deleteMyCommands } from '../telegram.js';
import { formatKst } from '../format.js';
import { setRole, listPending } from '../auth.js';
import { listUserGroups, applyUserGroup } from '../user_groups.js';

// chat_id 후보 검증 — 빈문자/비숫자/길이초과/safe-int 범위 외는 거부.
// 길이 19 는 BIGINT 양수 최대(9223372036854775807) 자릿수. SQL BIGINT overflow 시
// 트랜잭션이 raw 에러 메시지를 root 에 반환하던 경로 차단.
function isValidChatId(s) {
  if (typeof s !== 'string' || !/^\d{1,19}$/.test(s)) return false;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0;
}

export async function cmdPending({ chatId }) {
  const rows = await listPending();
  if (!rows.length) return sendMessage('가입 대기 없음 ✨', chatId);
  const groups = await listUserGroups();
  const keys = groups.map((g) => g.key).join(' / ') || 'root / guest';
  const lines = ['<b>📋 가입 대기</b>'];
  for (const r of rows) {
    lines.push(`#${r.chat_id} · ${escapeHtml(r.name || '-')} · ${formatKst(r.registered_at)}`);
  }
  lines.push('');
  lines.push(`<i>적용: /setgroup &lt;chat_id&gt; &lt;group&gt; (${keys})</i>`);
  lines.push('<i>거부: /deny &lt;chat_id&gt;</i>');
  return sendMessage(lines.join('\n'), chatId);
}

// syncUserMenu, cmdHelp 는 commands.js 에서 주입 — 순환 import 방지.
export async function cmdSetGroup({ chatId, args, user }, { syncUserMenu, cmdHelp }) {
  const [target, groupKey] = (args || '').split(/\s+/);
  const groups = await listUserGroups();

  if (!isValidChatId(target) || !groupKey) {
    const list = groups.length
      ? groups.map((g) => `  • <code>${g.key}</code> ${g.label}${g.is_root ? ' [root]' : ''}`).join('\n')
      : '  (없음)';
    return sendMessage(
      [
        '사용법: <code>/setgroup &lt;chat_id&gt; &lt;group&gt;</code>',
        '예: <code>/setgroup 1234567890 guest</code>',
        '',
        '사용 가능 그룹:',
        list,
      ].join('\n'),
      chatId,
    );
  }

  const r = await applyUserGroup(target, groupKey, user.chat_id);
  if (!r.ok) return sendMessage(`❌ ${r.error}`, chatId);
  const label = groups.find((g) => g.key === groupKey)?.label || groupKey;
  await sendMessage(`✅ #${target} → ${label} (role=${r.role})`, chatId);
  // 대상자 [/] 메뉴 갱신 + 도움말 안내.
  try { await syncUserMenu(target); } catch (e) { console.error('[setgroup] syncUserMenu', e?.message); }
  try {
    await sendMessage(
      [
        `🎉 사용 가능해요!`,
        ``,
        `채팅창 하단의 버튼을 누르거나 <b>/help</b> 로 시작하세요.`,
      ].join('\n'),
      target,
    );
    // /help 자동 호출 — 첫 사용 진입 부담 줄임.
    await cmdHelp({ chatId: target });
  } catch {}
}

// syncUserMenu 는 commands.js 에서 주입 — 순환 import 방지.
export async function cmdDeny({ chatId, args, user }, { syncUserMenu }) {
  const target = (args || '').split(/\s+/)[0];
  if (!isValidChatId(target)) return sendMessage('사용법: /deny &lt;chat_id&gt;', chatId);
  const ok = await setRole(target, 'denied', user.chat_id);
  if (!ok) return sendMessage(`#${target} 없음`, chatId);
  // 차단된 사용자 [/] 메뉴 비우기.
  try { await syncUserMenu(target); } catch (e) { console.error('[deny] syncUserMenu', e?.message); }
  return sendMessage(`🚫 #${target} 차단됨`, chatId);
}
