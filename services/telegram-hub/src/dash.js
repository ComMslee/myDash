// dashboard API 호출 헬퍼 — TeslaMate DB 접근은 전적으로 dashboard 가 책임지고
// hub 는 fetch 결과를 텔레그램 메시지로 포맷만 함. 인증은 X-Hub-Secret 헤더로
// 쿠키 인증 우회 (dashboard/lib/auth-helper.js).

const URL = process.env.DASHBOARD_URL || 'http://dashboard:5000';
const SECRET = process.env.HUB_SHARED_SECRET || '';

// dashboard 의 transient 5xx 1회 재시도 — idempotent GET 한정.
// 정상(2xx)/4xx 는 즉시 반환. throw 케이스(타임아웃/네트워크)도 1회 재시도.
// CLAUDE.md 함정: dashboard /api/route-map 5xx 회복 패턴(`9ea3ebb`) 과 동형.
export async function dashGet(path) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`${URL}${path}`, {
        headers: SECRET ? { 'x-hub-secret': SECRET } : {},
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      });
      if (r.ok) return await r.json();
      const body = await r.text().catch(() => '');
      console.error('[dash] GET', path, r.status, body.slice(0, 200), attempt ? '(retry)' : '');
      // 4xx 는 재시도 무의미 — 즉시 null. 5xx 만 1회 재시도.
      if (r.status < 500 || attempt >= 1) return null;
    } catch (e) {
      console.error('[dash] GET threw', path, e.message, attempt ? '(retry)' : '');
      if (attempt >= 1) return null;
    }
    await new Promise((res) => setTimeout(res, 200));
  }
  return null;
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
