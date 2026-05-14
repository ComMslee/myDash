// 인증 쿠키 옵션 — 요청 프로토콜에 맞춰 secure 플래그 자동 결정.
// Caddy 가 X-Forwarded-Proto 를 정확히 셋팅 (Caddyfile dashboard_proxy snippet).
// HTTPS 접속이면 secure 쿠키 → HTTP 로 다시 못 보냄 → 세션 평문 노출 방지.
// HTTP 직접 IP 접속이면 secure=false → 기존 동작 유지 (raw IP 디버그 호환).

export function authCookieOpts(req) {
  const proto = req?.headers?.get?.('x-forwarded-proto') || '';
  const secure = proto.toLowerCase() === 'https';
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
  };
}
