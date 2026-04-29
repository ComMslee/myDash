import { requireAuth } from '@/lib/auth-helper';
import os from 'node:os';
import pool from '@/lib/db';
import { getContainerStats } from '@/lib/docker-stats';

export const dynamic = 'force-dynamic';

// 모듈 레벨 ring buffer — 새로고침해도 유지, 앱 재시작 시 리셋.
// 240 샘플 × ~30초 = 2시간. dedupe 25s 미만 호출은 새 샘플 안 쌓음.
const HISTORY_MAX = 240;
const HISTORY_MIN_PUSH_INTERVAL_MS = 25_000;
const _history = [];
let _lastPushTs = 0;

function pushHistorySample(sample) {
  if (Date.now() - _lastPushTs < HISTORY_MIN_PUSH_INTERVAL_MS) return;
  _history.push(sample);
  if (_history.length > HISTORY_MAX) _history.shift();
  _lastPushTs = Date.now();
}

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
      // 이 TeslaMate 의 charges 엔 end_date 컬럼이 없음 — charging_processes 의 end_date 로 대체.
      pool.query('SELECT MAX(end_date) AS latest FROM charging_processes'),
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

  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const loadavg = os.loadavg().map(n => +n.toFixed(2));
  const containers = dockerStats?.ok ? (dockerStats.containers || []) : [];
  const findC = (n) => containers.find(c => c.name === n);
  const tm = findC('teslamate');
  const dash = findC('dashboard');

  // ring buffer 푸시 — 25s dedupe (다중 클라 폴링 / 페이지 새로고침 안 중복)
  pushHistorySample({
    ts: startedAt,
    hostCpu: loadavg[0] ?? null,
    hostMemPct: memTotal ? +((1 - memFree / memTotal) * 100).toFixed(1) : null,
    dbMs: dbOk ? dbLatencyMs : null,
    tmCpu: tm?.cpuPct ?? null,
    tmMemMB: tm?.memUsage != null ? +(tm.memUsage / 1024 / 1024).toFixed(1) : null,
    dashCpu: dash?.cpuPct ?? null,
    dashMemMB: dash?.memUsage != null ? +(dash.memUsage / 1024 / 1024).toFixed(1) : null,
  });

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
      loadavg,
      memTotal,
      memFree,
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
    history: _history.slice(),
  });
}
