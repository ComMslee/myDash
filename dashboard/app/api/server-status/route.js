import { requireAuth } from '@/lib/auth-helper';
import os from 'node:os';
import { readFile, statfs } from 'node:fs/promises';
import pool from '@/lib/db';
import { getContainerStats } from '@/lib/docker-stats';

// /proc/meminfo 파싱 — Linux 가용 메모리는 MemAvailable 가 실제 지표.
// os.freemem() 의 MemFree 는 캐시 회수 가능분 미반영이라 왜곡됨.
async function readMemInfo() {
  try {
    const text = await readFile('/proc/meminfo', 'utf8');
    const m = {};
    for (const line of text.split('\n')) {
      const mt = line.match(/^(\w+):\s+(\d+)/);
      if (mt) m[mt[1]] = +mt[2] * 1024; // kB → bytes
    }
    return {
      memTotal: m.MemTotal ?? null,
      memFree: m.MemFree ?? null,
      memAvailable: m.MemAvailable ?? null,
      buffers: m.Buffers ?? null,
      cached: m.Cached ?? null,
      swapTotal: m.SwapTotal ?? null,
      swapFree: m.SwapFree ?? null,
    };
  } catch {
    return null;
  }
}

// telegram-hub /health — docker network 내부 호출. 미가동/미설정 시 ok:false.
import { TG_HUB_URL } from '@/lib/internal-urls';
async function fetchTgHubHealth() {
  try {
    const r = await fetch(`${TG_HUB_URL}/health`, {
      signal: AbortSignal.timeout(1500),
      cache: 'no-store',
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = await r.json();
    return { ok: true, ...j };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// 루트 파일시스템 가용 용량 — fs.statfs (Node 18.15+).
async function getDiskRoot() {
  try {
    const s = await statfs('/');
    return {
      total: s.blocks * s.bsize,
      free: s.bfree * s.bsize,
      available: s.bavail * s.bsize, // 비-루트 사용자 가용분
    };
  } catch {
    return null;
  }
}

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

// DB 영구 로그 — 일별 피크/한산 시간 추적용. 5분 dedupe.
// 테이블은 /api/server-status 첫 호출 시 idempotent CREATE.
const DB_WRITE_INTERVAL_MS = 5 * 60_000;
let _lastDbWriteTs = 0;
let _schemaReady = false;

async function ensureSchema() {
  if (_schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS server_health_log (
      ts                 timestamptz PRIMARY KEY,
      host_cpu           real,
      host_mem_pct       real,
      host_mem_avail_pct real,
      db_ms              integer,
      tm_cpu             real,
      tm_mem_mb          real,
      dash_cpu           real,
      dash_mem_mb        real,
      disk_used_pct      real,
      swap_used_pct      real
    );
    CREATE INDEX IF NOT EXISTS idx_server_health_log_ts ON server_health_log(ts DESC);
  `);
  _schemaReady = true;
}

async function logSampleToDb(sample) {
  if (Date.now() - _lastDbWriteTs < DB_WRITE_INTERVAL_MS) return;
  try {
    await ensureSchema();
    await pool.query(
      `INSERT INTO server_health_log (ts, host_cpu, host_mem_pct, host_mem_avail_pct,
         db_ms, tm_cpu, tm_mem_mb, dash_cpu, dash_mem_mb, disk_used_pct, swap_used_pct)
       VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (ts) DO NOTHING`,
      [sample.hostCpu, sample.hostMemPct, sample.hostMemAvailPct,
       sample.dbMs, sample.tmCpu, sample.tmMemMB, sample.dashCpu, sample.dashMemMB,
       sample.diskUsedPct, sample.swapUsedPct]
    );
    _lastDbWriteTs = Date.now();
  } catch (e) {
    // DB 로깅 실패는 응답을 깨뜨리지 않음 — 콘솔만.
    console.warn('[server-status] db log failed:', e.message);
  }
}

// 최근 24h 피크/한산 (호스트 CPU 기준).
async function fetchDailyExtremes() {
  try {
    const res = await pool.query(
      `WITH d AS (
         SELECT ts, host_cpu, host_mem_pct
         FROM server_health_log
         WHERE ts >= NOW() - INTERVAL '24 hours' AND host_cpu IS NOT NULL
       )
       SELECT
         (SELECT host_cpu FROM d ORDER BY host_cpu DESC LIMIT 1)  AS peak_cpu,
         (SELECT ts       FROM d ORDER BY host_cpu DESC LIMIT 1)  AS peak_ts,
         (SELECT host_cpu FROM d ORDER BY host_cpu ASC  LIMIT 1)  AS quiet_cpu,
         (SELECT ts       FROM d ORDER BY host_cpu ASC  LIMIT 1)  AS quiet_ts,
         (SELECT COUNT(*) FROM d)::int                            AS samples`
    );
    const r = res.rows[0];
    if (!r || !r.samples) return null;
    return {
      peak: { cpu: r.peak_cpu, ts: r.peak_ts },
      quiet: { cpu: r.quiet_cpu, ts: r.quiet_ts },
      samples: r.samples,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const __unauth = await requireAuth();
  if (__unauth) return __unauth;
  const startedAt = Date.now();
  const memUsage = process.memoryUsage();
  const cpu = process.cpuUsage();

  const dbT0 = performance.now();
  const [dbResults, dockerStats, memInfo, disk, tgHub] = await Promise.all([
    Promise.allSettled([
      pool.query('SELECT MAX(date)     AS latest FROM positions'),
      pool.query('SELECT MAX(end_date) AS latest FROM drives'),
      // 이 TeslaMate 의 charges 엔 end_date 컬럼이 없음 — charging_processes 의 end_date 로 대체.
      pool.query('SELECT MAX(end_date) AS latest FROM charging_processes'),
      pool.query('SELECT COUNT(*)::int AS n      FROM cars'),
      pool.query('SELECT version()     AS v'),
    ]),
    getContainerStats(), // docker.sock RO — 실패 시 ok:false 반환
    readMemInfo(),
    getDiskRoot(),
    fetchTgHubHealth(),
  ]);
  const dbLatencyMs = Math.round(performance.now() - dbT0);
  const dbOk = dbResults.every(r => r.status === 'fulfilled');
  const firstRejected = dbResults.find(r => r.status === 'rejected');
  const dbError = firstRejected?.reason?.message || null;

  const pick = (i, key = 'latest') =>
    dbResults[i].status === 'fulfilled' ? dbResults[i].value.rows[0]?.[key] ?? null : null;

  // 메모리 — /proc/meminfo 가능하면 MemAvailable 기반(정확), 폴백은 os.freemem().
  const memTotal = memInfo?.memTotal || os.totalmem();
  const memFree = memInfo?.memFree ?? os.freemem();
  const memAvailable = memInfo?.memAvailable ?? memFree; // 폴백: free 사용
  const memUsedActual = memTotal - memAvailable;          // 실제 사용 (캐시 제외)
  const loadavg = os.loadavg().map(n => +n.toFixed(2));
  const containers = dockerStats?.ok ? (dockerStats.containers || []) : [];
  const findC = (n) => containers.find(c => c.name === n);
  const tm = findC('teslamate');
  const dash = findC('dashboard');

  const sample = {
    ts: startedAt,
    hostCpu: loadavg[0] ?? null,
    hostMemPct: memTotal ? +((memUsedActual / memTotal) * 100).toFixed(1) : null,
    hostMemAvailPct: memTotal ? +((memAvailable / memTotal) * 100).toFixed(1) : null,
    dbMs: dbOk ? dbLatencyMs : null,
    tmCpu: tm?.cpuPct ?? null,
    tmMemMB: tm?.memUsage != null ? +(tm.memUsage / 1024 / 1024).toFixed(1) : null,
    dashCpu: dash?.cpuPct ?? null,
    dashMemMB: dash?.memUsage != null ? +(dash.memUsage / 1024 / 1024).toFixed(1) : null,
    diskUsedPct: disk?.total ? +((1 - disk.available / disk.total) * 100).toFixed(1) : null,
    swapUsedPct: memInfo?.swapTotal
      ? +((1 - (memInfo.swapFree ?? 0) / memInfo.swapTotal) * 100).toFixed(1) : null,
  };

  // ring buffer 푸시 (25s dedupe) — 메모리, 새로고침 후에도 유지(앱 재시작 시 리셋)
  pushHistorySample(sample);
  // DB 영구 로그 (5min dedupe) — 일별 피크/한산 추적
  // await 안 함: 응답 latency 영향 최소화, 실패해도 응답 안 깸
  logSampleToDb(sample);

  // 최근 24h 피크/한산 — DB 로그 기반
  const daily = await fetchDailyExtremes();

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
      memAvailable,    // 캐시 회수 가능분 포함 — 실제 가용
      memCached: memInfo?.cached ?? null,
      memBuffers: memInfo?.buffers ?? null,
      swapTotal: memInfo?.swapTotal ?? null,
      swapFree: memInfo?.swapFree ?? null,
      disk,            // { total, free, available } — 루트 파일시스템
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
    tgHub, // { ok, uptime_sec, state? } | { ok:false, error }
    history: _history.slice(),
    daily, // { peak: {cpu, ts}, quiet: {cpu, ts}, samples } | null
  });
}
