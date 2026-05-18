import pool from '@/lib/db';
import { evaluateAll } from '@/lib/schedule-evaluator';
import { detectAndRecord } from '@/lib/geofence-detector';
import { executeAction, skipExecution } from '@/lib/schedule-runner';

// 1분 1회 tick — instrumentation.js 에서 setInterval 로 호출.
// 1) 지오펜스 변화 감지 (positions → dash_location_events)
// 2) 스케줄 조건 평가 (시간/장소/날씨)
// 3) 발화 결정 건만 executeAction (Mock=dry_run, Real=Tesla API)

let running = false;

export async function tick() {
  if (running) return { skipped: 'already running' };
  running = true;
  try {
    const geo = await detectAndRecord().catch((e) => ({ events: 0, error: e?.message }));
    const ev = await evaluateAll().catch((e) => ({ error: e?.message, decisions: [] }));
    let fired = 0, skipped = 0;
    for (const d of (ev.decisions || [])) {
      if (d.fire) {
        await executeAction({
          schedule_id: d.s.id,
          action: d.s.action,
          action_params: d.s.action_params,
          trigger_source: d.trigger_source,
        });
        await pool.query(
          `UPDATE dash_schedules SET last_run_at = NOW() WHERE id = $1`,
          [d.s.id],
        );
        fired++;
      } else if (d.reason) {
        await skipExecution({
          schedule_id: d.s.id,
          action: d.s.action,
          action_params: d.s.action_params,
          reason: d.reason,
        });
        skipped++;
      }
    }
    return { geo, fired, skipped, evaluated: ev.evaluated || 0 };
  } finally {
    running = false;
  }
}
