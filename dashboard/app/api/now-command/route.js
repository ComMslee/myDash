import { requireAuth, assertSameOrigin } from '@/lib/auth-helper';
import { executeAction, ACTION_TO_COMMAND } from '@/lib/schedule-runner';

export const dynamic = 'force-dynamic';

// POST /api/now-command — 즉시 실행 (UI/봇 버튼)
// body: { action: 'sentry_on' | 'sentry_off' | 'climate_on' | 'climate_off' | 'lock' | 'unlock' | 'set_charge_limit', params?: {} }

// per-IP rate-limit — 같은 IP 60초당 10회 초과 시 429.
// 봇/UI 버튼 폭주·자동화 오남용 1차 방어. login 의 패턴과 동일한 in-memory Map.
// NOTE: 프로세스 재시작 시 카운터 초기화 — 영속화는 후속 작업.
const RL_WINDOW_MS = 60_000;
const RL_MAX = 10;
const rlHits = new Map();

function clientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function rateLimited(ip) {
  const now = Date.now();
  let entry = rlHits.get(ip);
  if (!entry || now - entry.first > RL_WINDOW_MS) {
    entry = { count: 0, first: now };
  }
  entry.count += 1;
  rlHits.set(ip, entry);
  return entry.count > RL_MAX;
}

export async function POST(req) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return Response.json({ error: 'rate_limited' }, { status: 429 });
  }

  try {
    const body = await req.json();
    if (!body?.action) return Response.json({ error: 'action required' }, { status: 400 });
    // 화이트리스트 사전 검증 — executeAction 내부에서도 검사하지만, 400 으로 빠르게 거절.
    if (!Object.prototype.hasOwnProperty.call(ACTION_TO_COMMAND, body.action)) {
      return Response.json({ error: 'invalid_action' }, { status: 400 });
    }
    const result = await executeAction({
      schedule_id: null,
      action: body.action,
      action_params: body.params || {},
      trigger_source: 'manual',
    });
    return Response.json({ ok: true, result });
  } catch (e) {
    return Response.json({ error: e?.message || 'unknown' }, { status: 500 });
  }
}
