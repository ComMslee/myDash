import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();
  const memUsage = process.memoryUsage();

  let dbOk = false;
  let dbLatencyMs = null;
  let latestPosition = null;
  let dbError = null;
  try {
    const t0 = performance.now();
    const r = await pool.query(`SELECT MAX(date) AS latest FROM positions`);
    dbLatencyMs = Math.round(performance.now() - t0);
    dbOk = true;
    latestPosition = r.rows[0]?.latest || null;
  } catch (e) {
    dbError = e.message || String(e);
  }

  return Response.json({
    serverTime: startedAt,
    uptimeSec: Math.round(process.uptime()),
    node: process.version,
    env: process.env.NODE_ENV || 'unknown',
    memory: {
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
    },
    db: {
      ok: dbOk,
      latencyMs: dbLatencyMs,
      latestPosition,
      error: dbError,
    },
  });
}
