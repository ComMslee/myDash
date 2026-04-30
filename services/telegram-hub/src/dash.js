// dashboard API 호출 헬퍼 — TeslaMate DB 접근은 전적으로 dashboard 가 책임지고
// hub 는 fetch 결과를 텔레그램 메시지로 포맷만 함. 인증은 X-Hub-Secret 헤더로
// 쿠키 인증 우회 (dashboard/lib/auth-helper.js).

const URL = process.env.DASHBOARD_URL || 'http://dashboard:5000';
const SECRET = process.env.HUB_SHARED_SECRET || '';

export async function dashGet(path) {
  try {
    const r = await fetch(`${URL}${path}`, {
      headers: SECRET ? { 'x-hub-secret': SECRET } : {},
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error('[dash] GET', path, r.status, body.slice(0, 200));
      return null;
    }
    return await r.json();
  } catch (e) {
    console.error('[dash] GET threw', path, e.message);
    return null;
  }
}
