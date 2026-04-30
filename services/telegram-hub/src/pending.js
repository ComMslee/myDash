// 다단계 대화용 in-memory pending action 저장.
// 재시작 시 사라짐 (의도) — 5분 안에 후속 메시지 안 오면 자동 만료.
//
// 현재 사용처: SNS 글쓰기 (/post 인자 없이 진입 → 다음 메시지를 본문으로 받음).
// 향후 일정 등록 등 다단계 입력에 재사용.

const _pending = new Map(); // chatId -> { action, data, startedAt }
const TTL_MS = 5 * 60 * 1000;

export function setPending(chatId, action, data = {}) {
  _pending.set(String(chatId), { action, data, startedAt: Date.now() });
}

export function getPending(chatId) {
  const key = String(chatId);
  const p = _pending.get(key);
  if (!p) return null;
  if (Date.now() - p.startedAt > TTL_MS) {
    _pending.delete(key);
    return null;
  }
  return p;
}

export function clearPending(chatId) {
  _pending.delete(String(chatId));
}
