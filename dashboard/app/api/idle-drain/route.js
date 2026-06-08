import { requireAuth } from '@/lib/auth-helper';
import { getDefaultCar } from '@/lib/queries/car';
import { queryIdleDrain, queryChargingSessions } from '@/lib/queries/battery-idle';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  try {
    const car = await getDefaultCar();
    if (!car) return Response.json({ error: 'No car found' }, { status: 404 });
    const carId = car.id;
    const [idleRes, sessRes] = await Promise.all([
      queryIdleDrain(carId),
      queryChargingSessions(carId),
    ]);
    return Response.json({
      idle_drain: idleRes.rows.map(r => ({
        idle_start: r.idle_start,
        idle_end: r.idle_end,
        soc_start: parseInt(r.soc_start),
        soc_end: parseInt(r.soc_end),
        soc_drop: parseInt(r.soc_drop),
        idle_hours: parseFloat(r.idle_hours),
        next_type: r.next_type,
        climate_minutes: parseFloat(r.climate_minutes) || 0,
        climate_spans: Array.isArray(r.climate_spans)
          ? r.climate_spans.map(sp => ({ s: Number(sp.s), e: Number(sp.e) }))
          : [],
        online_minutes: parseFloat(r.online_minutes) || 0,
        online_spans: Array.isArray(r.online_spans)
          ? r.online_spans.map(sp => ({ s: Number(sp.s), e: Number(sp.e) }))
          : [],
      })),
      charging_sessions: sessRes.rows.map(r => ({
        start: r.start_date,
        end: r.end_date,
        soc_start: parseInt(r.soc_start),
        soc_end: parseInt(r.soc_end),
        soc_added: parseInt(r.soc_added),
        duration_hours: parseFloat(r.duration_hours),
      })),
    });
  } catch (err) {
    console.error('/api/idle-drain error:', err);
    return Response.json({ error: 'DB error', detail: err.message }, { status: 500 });
  }
}
