import { requireAuth, assertSameOrigin } from '@/lib/auth-helper';

export const dynamic = 'force-dynamic';

// SNS 블로그 발행 — 현재는 mock. hub→dashboard 채널 검증용.
// 실제 네이버 블로그 OAuth/발행은 후속 PR 에서. 지금은 받기만 하고 200 OK.
//
// 요청 body: { platform: 'naver', body: '...', chat_id: '...', user_name: '...' }
// 응답: { ok: true, request_id, accepted_at, platform, body_len }

export async function POST(req) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;

  let payload = null;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const platform = String(payload?.platform || '').toLowerCase();
  const body = String(payload?.body || '').trim();
  const photos = Array.isArray(payload?.photos) ? payload.photos : [];

  if (platform !== 'naver') {
    return Response.json(
      { ok: false, error: `unsupported_platform: ${platform || '(empty)'}` },
      { status: 400 },
    );
  }
  // 본문 또는 사진 중 하나는 있어야 함.
  if (!body && !photos.length) {
    return Response.json({ ok: false, error: 'empty_body_and_photos' }, { status: 400 });
  }

  const requestId = `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const acceptedAt = new Date().toISOString();

  // mock — 실제 발행 X. 서버 로그에 흐름 검증용으로만 남김.
  // PII 노출 방지: chat_id 마스킹, user_name·preview 제거. 전체 로깅은 LOG_PII=true 게이트.
  if (process.env.LOG_PII === 'true') {
    console.log(
      '[sns/blog] mock accepted (PII)',
      JSON.stringify({
        request_id: requestId,
        platform,
        chat_id: payload.chat_id || null,
        user_name: payload.user_name || null,
        body_len: body.length,
        photos: photos.length,
        preview: body.slice(0, 80),
      }),
    );
  } else {
    const chatIdMasked = payload.chat_id ? String(payload.chat_id).slice(0, 3) + '****' : null;
    console.log(
      '[sns/blog] mock accepted',
      JSON.stringify({
        request_id: requestId,
        platform,
        chat_id: chatIdMasked,
        body_len: body.length,
        photos: photos.length,
      }),
    );
  }

  return Response.json({
    ok: true,
    request_id: requestId,
    accepted_at: acceptedAt,
    platform,
    body_len: body.length,
    photos: photos.length,
    note: 'mock — 실제 발행은 후속 PR. 채널 검증용.',
  });
}
