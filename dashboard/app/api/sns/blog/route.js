import { requireAuth } from '@/lib/auth-helper';

export const dynamic = 'force-dynamic';

// SNS 블로그 발행 — 현재는 mock. hub→dashboard 채널 검증용.
// 실제 네이버 블로그 OAuth/발행은 후속 PR 에서. 지금은 받기만 하고 200 OK.
//
// 요청 body: { platform: 'naver', body: '...', chat_id: '...', user_name: '...' }
// 응답: { ok: true, request_id, accepted_at, platform, body_len }

export async function POST(req) {
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

  if (platform !== 'naver') {
    return Response.json(
      { ok: false, error: `unsupported_platform: ${platform || '(empty)'}` },
      { status: 400 },
    );
  }
  if (!body) {
    return Response.json({ ok: false, error: 'empty_body' }, { status: 400 });
  }

  const requestId = `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const acceptedAt = new Date().toISOString();

  // mock — 실제 발행 X. 서버 로그에 남겨 흐름 검증.
  console.log(
    '[sns/blog] mock accepted',
    JSON.stringify({
      request_id: requestId,
      platform,
      chat_id: payload.chat_id || null,
      user_name: payload.user_name || null,
      body_len: body.length,
      preview: body.slice(0, 80),
    }),
  );

  return Response.json({
    ok: true,
    request_id: requestId,
    accepted_at: acceptedAt,
    platform,
    body_len: body.length,
    note: 'mock — 실제 발행은 후속 PR. 채널 검증용.',
  });
}
