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

// dashboard 로 POST — SNS 발행 같은 액션. 응답: { ok, ... } 또는 null.
export async function dashPost(path, body) {
  try {
    const r = await fetch(`${URL}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(SECRET ? { 'x-hub-secret': SECRET } : {}),
      },
      body: JSON.stringify(body || {}),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!r.ok) {
      console.error('[dash] POST', path, r.status, text.slice(0, 200));
      return { ok: false, status: r.status, error: json?.error || text.slice(0, 200) };
    }
    return json || { ok: true };
  } catch (e) {
    console.error('[dash] POST threw', path, e.message);
    return { ok: false, error: e.message };
  }
}
