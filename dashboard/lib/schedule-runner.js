import { logExecution, bumpMonthlyUsage, calcCost, getMonthlyUsage, COST_HARD_CAP_USD } from '@/lib/queries/schedules';
import { callTeslaCommand } from '@/lib/tesla-fleet';

// Tesla 자동화 — 액션 1건 실행기.
// 1) Tesla Fleet API 호출 (mock or real — ENV 게이팅)
// 2) dash_schedule_executions 에 결과 저장
// 3) dash_api_usage_monthly 누적
// 워커(setInterval) · 수동 실행 · 즉시 명령 모두 이 함수를 통과.

export const ACTION_TO_COMMAND = {
  sentry_on: { command: 'set_sentry_mode', params: { on: true } },
  sentry_off: { command: 'set_sentry_mode', params: { on: false } },
  climate_on: { command: 'auto_conditioning_start', params: {} },
  climate_off: { command: 'auto_conditioning_stop', params: {} },
  set_temps: { command: 'set_temps', params: {} },
  lock: { command: 'door_lock', params: {} },
  unlock: { command: 'door_unlock', params: {} },
  charge_start: { command: 'charge_start', params: {} },
  charge_stop: { command: 'charge_stop', params: {} },
  set_charge_limit: { command: 'set_charge_limit', params: {} },
  flash_lights: { command: 'flash_lights', params: {} },
  honk_horn: { command: 'honk_horn', params: {} },
};

function monthYmd(d = new Date()) {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`;
}

// 호출 비용 추정 — Tesla 단가 표 (commands $0.001 / wakes $0.02).
// wake 는 차량 sleep 일 때만 — Fleet API 응답 분석 필요. 보수적으로 Mock 에선 commands 만 카운트,
// 실연동에선 응답 헤더/명령 결과의 wake_required 판단 후 wakes 도 누적.
export async function executeAction({ schedule_id, action, action_params, trigger_source }) {
  const map = ACTION_TO_COMMAND[action];
  if (!map) {
    const reason = `unknown action: ${action}`;
    await logExecution({
      schedule_id, trigger_source, action, action_params,
      status: 'failed', reason, api_calls: {}, cost_estimate: 0,
    });
    return { status: 'failed', reason };
  }

  const params = { ...map.params, ...(action_params || {}) };
  const enabled = process.env.TESLA_FLEET_API_ENABLED === 'true';

  // 비용 가드 — $10 무료 한도 초과 시 실호출 차단 (CLAUDE.md 약속). Mock 은 누적만, 차단 안 함.
  if (enabled) {
    const usage = await getMonthlyUsage(monthYmd());
    const used = Number(usage?.estimated_cost || 0);
    if (used >= COST_HARD_CAP_USD) {
      const reason = `monthly_budget_exceeded ($${used.toFixed(4)} >= $${COST_HARD_CAP_USD})`;
      const row = await logExecution({
        schedule_id, trigger_source, action, action_params,
        status: 'skipped', reason, api_calls: {}, cost_estimate: 0,
      });
      return { id: row.id, status: 'skipped', reason, cost_estimate: 0 };
    }
  }

  let status, reason = null, tesla_response = null, api_calls = {};
  try {
    if (enabled) {
      const r = await callTeslaCommand(map.command, params);
      tesla_response = r;
      api_calls = { commands: 1, ...(r?.wake_required ? { wakes: 1 } : {}) };
      status = r?.ok === false ? 'failed' : 'success';
      reason = r?.ok === false ? (r?.error || 'command failed') : null;
    } else {
      // Mock — 실제 호출 없이 dry_run 로그만
      tesla_response = { mock: true, command: map.command, params };
      api_calls = { commands: 1 };
      status = 'dry_run';
      reason = 'TESLA_FLEET_API_ENABLED != true';
    }
  } catch (e) {
    status = 'failed';
    reason = e?.message || 'execution error';
  }

  const cost_estimate = calcCost(api_calls);
  const row = await logExecution({
    schedule_id, trigger_source, action, action_params,
    status, reason, api_calls, tesla_response, cost_estimate,
  });
  // 비용 누적 — Mock 도 추정치 누적 (UI 에서 예상 사용량 보기 위해)
  await bumpMonthlyUsage(monthYmd(), api_calls);
  return { id: row.id, status, reason, cost_estimate };
}

// skipExecution — 조건 불충족 시 호출. 비용 안 듦, 사유만 기록.
export async function skipExecution({ schedule_id, action, action_params, reason, trigger_source = 'time' }) {
  await logExecution({
    schedule_id, trigger_source, action, action_params,
    status: 'skipped', reason,
    api_calls: {}, tesla_response: null, cost_estimate: 0,
  });
}
