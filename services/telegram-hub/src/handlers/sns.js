// SNS 발행 + 관련 콜백 핸들러 — /post, sns: inline 버튼

import { sendMessage, escapeHtml } from '../telegram.js';
import { dashPost } from '../dash.js';
import { setPending, getPending, clearPending } from '../pending.js';

// 글쓰기 진입/수정 단계용 inline 키보드 ([❌ 취소] 만).
export function snsCancelKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [[{ text: '❌ 취소', callback_data: 'sns:cancel' }]],
    },
  };
}

// 글쓰기 미리보기 단계용 inline 키보드 ([✅ 발행] [✏️ 수정] [❌ 취소]).
export function snsConfirmKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ 발행', callback_data: 'sns:publish' },
        { text: '✏️ 수정', callback_data: 'sns:edit' },
        { text: '❌ 취소', callback_data: 'sns:cancel' },
      ]],
    },
  };
}

// SNS 글쓰기 다단계 대화 — pending 상태 + 사용자 액션 분기.
export async function handleSnsCallback(chatId, action, user) {
  if (action === 'cancel') {
    clearPending(chatId);
    return sendMessage('❌ 글쓰기를 취소했어요.', chatId);
  }
  if (action === 'edit') {
    setPending(chatId, 'sns:body');
    return sendMessage(
      '✏️ 다시 본문/사진을 보내주세요. (5분 안)',
      chatId,
      snsCancelKeyboard(),
    );
  }
  if (action === 'publish') {
    const p = getPending(chatId);
    if (!p || p.action !== 'sns:confirm') {
      return sendMessage('⏰ 입력 시간이 지났어요. 다시 시도해 주세요.', chatId);
    }
    const r = await dashPost('/api/sns/blog', {
      platform: 'naver',
      body: p.data.body || '',
      photos: p.data.photos || [],
      chat_id: chatId,
      user_name: user?.name || null,
    });
    clearPending(chatId);
    if (r?.ok) {
      return sendMessage(
        [
          '✅ 서버 전달 확인됨 (mock)',
          '',
          `<i>요청 ID: ${escapeHtml(r.request_id || '-')}</i>`,
          '<i>실제 발행은 후속 PR에서 추가됩니다.</i>',
        ].join('\n'),
        chatId,
      );
    }
    return sendMessage(
      `❌ 서버 전달 실패\n<i>${escapeHtml(r?.error || 'unknown')}</i>`,
      chatId,
    );
  }
}

// ── SNS (mock) ───────────────────────────────────────
// 다단계 대화: cmdPost → pending 'sns:body' → 사용자 메시지(텍스트/사진/사진+캡션)
// → handlePendingMessage 가 미리보기 표시 + pending 'sns:confirm' → [✅ 발행] inline
// → handleSnsCallback('publish') 가 dashboard POST + clearPending.
// 인자 있으면 즉시 본문 입력으로 간주 — 한 줄 발행 단축 (사진은 다음 메시지로 보낼 수 없음).
export async function cmdPost({ chatId, args }) {
  const body = (args || '').trim();
  if (!body) {
    setPending(chatId, 'sns:body');
    return sendMessage(
      [
        '📝 <b>블로그 글쓰기</b> (mock)',
        '',
        '본문을 보내주세요. 사진도 첨부 가능합니다.',
        '<i>(텍스트만 / 사진만 / 사진+캡션 모두 OK · 5분 안)</i>',
      ].join('\n'),
      chatId,
      snsCancelKeyboard(),
    );
  }
  // 인자로 들어온 단축 모드 — 즉시 미리보기 단계로.
  setPending(chatId, 'sns:confirm', { body, photos: [] });
  const lines = [
    '📝 <b>발행 미리보기</b>',
    '',
    `<b>플랫폼</b>: 네이버 블로그`,
    `<b>본문</b> (${body.length}자):`,
    `<code>${escapeHtml(body.slice(0, 500))}${body.length > 500 ? '…' : ''}</code>`,
    '',
    '<i>발행하시려면 아래 버튼을 눌러주세요.</i>',
  ];
  return sendMessage(lines.join('\n'), chatId, snsConfirmKeyboard());
}
