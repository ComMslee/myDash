import { requireAuth } from '@/lib/auth-helper';
import os from 'node:os';
import pool from '@/lib/db';
import { getContainerStats } from '@/lib/docker-stats';

export const dynamic = 'force-dynamic';

export async function GET() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const startedAt = Date.now();
  const memUsage = process.memoryUsage();
  const cpu = process.cpuUsage();

  const dbT0 = performance.now();
  const [dbResults, dockerStats] = await Promise.all([
    Promise.allSettled([
      pool.query('SELECT MAX(date)     AS latest FROM positions'),
      pool.query('SELECT MAX(end_date) AS latest FROM drives'),
      pool.query('SELECT MAX(end_date) AS latest FROM charges'),
      pool.query('SELECT COUNT(*)::int AS n      FROM cars'),
      pool.query('SELECT version()     AS v'),
    ]),
    getContainerStats(), // docker.sock RO — 실패 시 ok:false 반환
  ]);
  const dbLatencyMs = Math.round(performance.now() - dbT0);
  const dbOk = dbResults.every(r => r.status === 'fulfilled');
  const firstRejected = dbResults.find(r => r.status === 'rejected');
  const dbError = firstRejected?.reason?.message || null;

  const pick = (i, key = 'latest') =>
    dbResults[i].status === 'fulfilled' ? dbResults[i].value.rows[0]?.[key] ?? null : null;

  return Response.json({
    serverTime: startedAt,
    uptimeSec: Math.round(process.uptime()),
    node: process.version,
    env: process.env.NODE_ENV || 'unknown',
    process: {
      pid: process.pid,
      v8: process.versions.v8,
      cpuUserSec: +(cpu.user / 1_000_000).toFixed(2),
      cpuSysSec: +(cpu.system / 1_000_000).toFixed(2),
    },
    memory: {
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
    },
    host: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      uptime: Math.round(os.uptime()),
      cpuCount: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || null,
      loadavg: os.loadavg().map(n => +n.toFixed(2)),
      memTotal: os.totalmem(),
      memFree: os.freemem(),
    },
    db: {
      ok: dbOk,
      latencyMs: dbLatencyMs,
      poolStats: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
      latestPosition: pick(0),
      latestDrive: pick(1),
      latestCharge: pick(2),
      carCount: pick(3, 'n'),
      version: pick(4, 'v'),
      error: dbError,
    },
    docker: dockerStats,
  });
}
