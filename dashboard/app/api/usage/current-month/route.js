import { requireAuth } from '@/lib/auth-helper';
import { getMonthlyUsage } from '@/lib/queries/schedules';

export const dynamic = 'force-dynamic';

// GET /api/usage/current-month — 이번 달 API 사용량 + 예상치
// 예상치 = 일평균 × 월 일수 (단순 선형 외삽). $10 무료 크레딧 대비 진행률 포함.
function monthYmd(d = new Date()) {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(s => parseInt(s, 10));
  return new Date(y, m, 0).getDate();
}

function dayOfMonth(d = new Date()) {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return kst.getUTCDate();
}

export async function GET(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month') || monthYmd();
  const usage = await getMonthlyUsage(month);

  const today = dayOfMonth();
  const totalDays = daysInMonth(month);
  const elapsedDays = Math.max(1, today);
  const actual = Number(usage.estimated_cost) || 0;
  const projected = (actual / elapsedDays) * totalDays;

  const CREDIT = 10;
  return Response.json({
    month,
    actual_cost: actual,
    projected_cost: projected,
    credit: CREDIT,
    actual_pct: Math.min(100, (actual / CREDIT) * 100),
    projected_pct: Math.min(100, (projected / CREDIT) * 100),
    calls: {
      commands: usage.commands_count,
      wakes: usage.wakes_count,
      vehicle_data: usage.vehicle_data_count,
      streaming_signals: Number(usage.streaming_signals_count) || 0,
    },
    elapsed_days: elapsedDays,
    total_days: totalDays,
    last_updated: usage.last_updated || null,
  });
}
