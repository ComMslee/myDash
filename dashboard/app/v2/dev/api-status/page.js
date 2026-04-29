'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { WarmDiagCard } from '@/app/v2/battery/home-charger/poll-log/diag';

// ── 라우트 메타데이터 ─────────────────────────────────────────
// dashboard: 펼침 시 raw peek 위에 추가로 보여줄 대시보드 ('server' | 'charging' | 'poll')
// params[].sample 의 'auto:firstDriveId' 는 마운트 시 /api/drives 응답에서 자동 픽
const ROUTES = [
  // 시스템
  { path: '/api/server-status',    label: '서버 상태',       category: '시스템', dashboard: 'server' },

  // 차량
  { path: '/api/car',              label: '차량',           category: '차량' },
  { path: '/api/drives',           label: '주행 요약',      category: '차량',
    params: [
      { key: 'from', sample: '' },
      { key: 'to',   sample: '' },
    ] },
  { path: '/api/insights',         label: '인사이트',       category: '차량' },

  // 주행
  { path: '/api/route-map',        label: '경로 지도',      category: '주행',
    params: [
      { key: 'driveId', required: true, sample: 'auto:firstDriveId' },
      { key: 'detail',  sample: '' },
    ] },
  { path: '/api/heatmap',          label: '히트맵',         category: '주행' },
  { path: '/api/year-heatmap',     label: '연간 히트맵',    category: '주행' },
  { path: '/api/monthly-history',  label: '월간 이력',      category: '주행' },
  { path: '/api/frequent-places',  label: '자주 가는 곳',   category: '주행' },
  { path: '/api/rankings',         label: '랭킹',           category: '주행',
    params: [
      { key: 'type',  sample: 'drive_distance' },
      { key: 'limit', sample: '30' },
    ] },

  // 배터리
  { path: '/api/battery',          label: '배터리',         category: '배터리' },
  { path: '/api/battery-trend',    label: '배터리 추이',    category: '배터리' },
  { path: '/api/charges',          label: '충전 기록',      category: '배터리' },
  { path: '/api/charge-all-time',  label: '충전 전기간',    category: '배터리' },
  { path: '/api/charging-status',  label: '충전 상태',      category: '배터리', dashboard: 'charging' },
  { path: '/api/fast-charges',     label: '급속 기록',      category: '배터리' },
  { path: '/api/slow-charges',     label: '완속 기록',      category: '배터리' },
  { path: '/api/debug/charging',   label: '디버그 · 충전',  category: '배터리' },

  // 집충전기
  { path: '/api/home-charger',                  label: '집충전기',         category: '집충전기',
    params: [{ key: 'refresh', sample: '' }] },
  { path: '/api/home-charger/fleet-stats',      label: '집충전기 누적',    category: '집충전기',
    params: [{ key: 'months', sample: '' }] },
  { path: '/api/home-charger/poll-log',         label: '집충전기 로그',    category: '집충전기', dashboard: 'poll',
    params: [
      { key: 'view', sample: 'hourly' },
      { key: 'days', sample: '' },
      { key: 'date', sample: '' },
    ] },
  { path: '/api/find-nearby-chargers',          label: '주변 충전소',      category: '집충전기',
    params: [
      { key: 'radius', sample: '' },
      { key: 'count',  sample: '' },
      { key: 'addr',   sample: '' },
      { key: 'name',   sample: '' },
    ] },
];

const CATEGORIES = ['시스템', '차량', '주행', '배터리', '집충전기'];

const SLOW_MS = 1500;

function fmtBytes(n) {
  if (n == null) return '—';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

function fmtMs(n) {
  if (n == null) return '—';
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(2)}s`;
}

function buildQS(params, values) {
  if (!params?.length) return '';
  const usp = new URLSearchParams();
  for (const p of params) {
    const v = values?.[p.key];
    if (v != null && v !== '') usp.set(p.key, v);
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

function summarizePayload(text) {
  if (!text) return { kind: 'empty', hint: '—', peek: '', parsed: null };
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    return { kind: 'text', hint: `${text.length}자`, peek: text.slice(0, 500), parsed: null };
  }
  let hint = '';
  if (Array.isArray(parsed)) {
    hint = `${parsed.length}행`;
  } else if (parsed && typeof parsed === 'object') {
    const keys = Object.keys(parsed);
    if ('error' in parsed) hint = `error: ${String(parsed.error).slice(0, 40)}`;
    else hint = `${keys.length}키`;
  } else {
    hint = String(parsed).slice(0, 30);
  }
  let peek;
  try { peek = JSON.stringify(parsed, null, 2).slice(0, 800); }
  catch { peek = text.slice(0, 800); }
  return { kind: 'json', hint, peek, parsed };
}

function stateColor(s) {
  if (s === 'ok')      return { dot: 'bg-emerald-400', text: 'text-emerald-400' };
  if (s === 'slow')    return { dot: 'bg-amber-400',   text: 'text-amber-400' };
  if (s === 'fail')    return { dot: 'bg-rose-400',    text: 'text-rose-400' };
  if (s === 'running') return { dot: 'bg-blue-400 animate-pulse', text: 'text-blue-400' };
  return { dot: 'bg-zinc-700', text: 'text-zinc-600' };
}

export default function ApiStatusPage() {
  const [results, setResults] = useState({});
  const [paramValues, setParamValues] = useState({});
  const [expanded, setExpanded] = useState({});
  const [editing, setEditing] = useState({});
  const [autoDriveId, setAutoDriveId] = useState(null);
  const [autoErr, setAutoErr] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const runIdRef = useRef(0);

  // 마운트 시 driveId 자동 픽
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/drives');
        const d = await res.json();
        if (!alive) return;
        const id = d?.recent_drives?.[0]?.id;
        if (id != null) setAutoDriveId(String(id));
        else setAutoErr('recent_drives 비어 있음');
      } catch (e) {
        if (alive) setAutoErr(e.message || '조회 실패');
      }
    })();
    return () => { alive = false; };
  }, []);

  // 사용자 편집 보존하며 sample 채우기
  useEffect(() => {
    setParamValues(prev => {
      const next = { ...prev };
      for (const r of ROUTES) {
        if (!r.params) continue;
        const merged = { ...(next[r.path] || {}) };
        for (const p of r.params) {
          if (p.sample === 'auto:firstDriveId') {
            if (!merged[p.key] && autoDriveId) merged[p.key] = autoDriveId;
            else if (merged[p.key] == null) merged[p.key] = '';
          } else if (merged[p.key] == null) {
            merged[p.key] = p.sample || '';
          }
        }
        next[r.path] = merged;
      }
      return next;
    });
  }, [autoDriveId]);

  const counts = useMemo(() => {
    const c = { ok: 0, slow: 0, fail: 0, idle: 0, running: 0 };
    for (const r of ROUTES) {
      const s = results[r.path]?.state || 'idle';
      c[s] = (c[s] || 0) + 1;
    }
    return c;
  }, [results]);

  async function runOne(route) {
    const myRun = ++runIdRef.current;
    setResults(prev => ({ ...prev, [route.path]: { state: 'running' } }));

    const qs = buildQS(route.params, paramValues[route.path]);
    const url = route.path + qs;
    const t0 = performance.now();
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const text = await res.text();
      const dt = performance.now() - t0;
      const sum = summarizePayload(text);
      const ok = res.ok && !(sum.parsed && typeof sum.parsed === 'object' && 'error' in sum.parsed);
      const state = !ok ? 'fail' : (dt >= SLOW_MS ? 'slow' : 'ok');
      const result = {
        state,
        status: res.status,
        ms: dt,
        bytes: text.length,
        url,
        hint: sum.hint,
        peek: sum.peek,
        parsed: sum.parsed,
      };
      setResults(prev => prev[route.path]?.runId && prev[route.path].runId > myRun ? prev : { ...prev, [route.path]: { ...result, runId: myRun } });
    } catch (e) {
      const dt = performance.now() - t0;
      setResults(prev => ({
        ...prev,
        [route.path]: {
          state: 'fail',
          status: null,
          ms: dt,
          bytes: null,
          url,
          hint: 'fetch 실패',
          peek: String(e?.message || e).slice(0, 800),
          parsed: null,
          runId: myRun,
        },
      }));
    }
  }

  async function runAll() {
    setLastRun(Date.now());
    await Promise.allSettled(ROUTES.map(r => runOne(r)));
  }

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 py-5 pb-8 flex flex-col gap-4">

        {/* 헤더 + 요약 */}
        <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold tracking-widest uppercase text-zinc-500">API 상태</span>
            <button
              onClick={runAll}
              className="px-3 py-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 text-xs font-semibold"
            >
              전체 재실행
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs tabular-nums">
            <span className="text-emerald-400">✓ {counts.ok}</span>
            <span className="text-amber-400">⚠ {counts.slow}</span>
            <span className="text-rose-400">✕ {counts.fail}</span>
            {counts.running > 0 && <span className="text-blue-400">… {counts.running}</span>}
            <span className="text-zinc-600">⏸ {counts.idle}</span>
            <span className="ml-auto text-[10px] text-zinc-600">
              {lastRun ? new Date(lastRun).toLocaleTimeString('ko-KR') : '미실행'}
            </span>
          </div>
          <div className="mt-2 text-[10px] text-zinc-600">
            driveId 자동: <span className={autoDriveId ? 'text-zinc-400' : 'text-rose-400'}>{autoDriveId || autoErr || '로딩…'}</span>
          </div>
        </div>

        {/* 카테고리별 */}
        {CATEGORIES.map(cat => {
          const list = ROUTES.filter(r => r.category === cat);
          return (
            <div key={cat} className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
              <div className="px-4 py-2 border-b border-white/[0.06]">
                <span className="text-[11px] font-bold tracking-widest uppercase text-zinc-500">{cat}</span>
              </div>
              <div>
                {list.map(route => (
                  <RouteRow
                    key={route.path}
                    route={route}
                    result={results[route.path]}
                    values={paramValues[route.path] || {}}
                    setValue={(k, v) => setParamValues(prev => ({ ...prev, [route.path]: { ...(prev[route.path] || {}), [k]: v } }))}
                    expanded={!!expanded[route.path]}
                    onToggleExpand={() => setExpanded(prev => ({ ...prev, [route.path]: !prev[route.path] }))}
                    editing={!!editing[route.path]}
                    onToggleEdit={() => setEditing(prev => ({ ...prev, [route.path]: !prev[route.path] }))}
                    onRun={() => runOne(route)}
                  />
                ))}
              </div>
            </div>
          );
        })}

      </div>
    </main>
  );
}

function RouteRow({ route, result, values, setValue, expanded, onToggleExpand, editing, onToggleEdit, onRun }) {
  const state = result?.state || 'idle';
  const c = stateColor(state);
  const hasParams = !!route.params?.length;
  const missingRequired = route.params?.some(p => p.required && !values[p.key]);

  return (
    <div className="border-b border-white/[0.04] last:border-0">
      <div className="px-4 py-2.5 flex items-center gap-2 text-[11px]">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />

        <button
          onClick={onToggleExpand}
          className="flex-1 min-w-0 text-left flex items-center gap-2"
        >
          <span className="font-mono text-zinc-300 truncate">{route.path}</span>
          <span className="text-[9px] text-zinc-700 font-mono shrink-0">GET</span>
          {route.dashboard && (
            <span className="text-[8px] px-1 rounded bg-blue-500/15 text-blue-300 shrink-0" title="대시보드 뷰 제공">📊</span>
          )}
        </button>

        <span className="flex items-center gap-2 tabular-nums shrink-0">
          {state === 'idle' ? (
            <span className="text-zinc-700">대기</span>
          ) : state === 'running' ? (
            <span className="text-blue-400">…</span>
          ) : (
            <>
              <span className={c.text}>{result.status ?? 'ERR'}</span>
              <span className={result.ms >= SLOW_MS ? 'text-amber-400' : 'text-zinc-500'}>{fmtMs(result.ms)}</span>
              <span className="text-zinc-600">{fmtBytes(result.bytes)}</span>
            </>
          )}
          <button
            onClick={onRun}
            disabled={missingRequired || state === 'running'}
            className="w-6 h-6 rounded hover:bg-white/[0.06] flex items-center justify-center text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
            title={missingRequired ? '필수 파라미터 없음' : '실행'}
          >
            ▶
          </button>
          {hasParams && (
            <button
              onClick={onToggleEdit}
              className={`w-6 h-6 rounded hover:bg-white/[0.06] flex items-center justify-center ${editing ? 'text-blue-300' : 'text-zinc-500'}`}
              title="파라미터 편집"
            >
              ✏︎
            </button>
          )}
        </span>
      </div>

      {/* 파라미터 칩 / 편집 */}
      {hasParams && (
        <div className="px-4 pb-2 -mt-1">
          {editing ? (
            <div className="flex flex-wrap gap-1.5 items-center">
              {route.params.map(p => (
                <label key={p.key} className="flex items-center gap-1 text-[10px] tabular-nums">
                  <span className={p.required ? 'text-amber-400' : 'text-zinc-500'}>
                    {p.key}{p.required ? '*' : ''}
                  </span>
                  <input
                    value={values[p.key] ?? ''}
                    onChange={(e) => setValue(p.key, e.target.value)}
                    placeholder={p.sample === 'auto:firstDriveId' ? 'auto' : p.sample || '—'}
                    className="bg-zinc-800/60 border border-white/[0.06] rounded px-1.5 py-0.5 text-zinc-200 text-[10px] w-20 focus:outline-none focus:border-blue-400/40"
                  />
                </label>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1 text-[10px] tabular-nums">
              {route.params.filter(p => values[p.key]).map(p => (
                <span key={p.key} className="px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-500">
                  <span className="text-zinc-600">{p.key}=</span>
                  <span className="text-zinc-300">{values[p.key]}</span>
                </span>
              ))}
              {missingRequired && (
                <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400">필수 파라미터 없음</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* 펼침 */}
      {expanded && result && state !== 'idle' && state !== 'running' && (
        <div className="px-4 pb-3 space-y-2">
          {/* 대시보드 뷰 (시스템/충전 진단/폴링 진단 라우트만) */}
          {route.dashboard === 'server' && result.parsed && (
            <ServerStatusCard data={result.parsed} latencyMs={result.ms} />
          )}
          {route.dashboard === 'charging' && result.parsed && (
            <ChargingDiagPanel data={result.parsed} />
          )}
          {route.dashboard === 'poll' && result.parsed?.warmDiag && (
            <WarmDiagCard diag={result.parsed.warmDiag} />
          )}

          {/* raw peek */}
          <div>
            <div className="text-[10px] text-zinc-600 mb-1 tabular-nums">
              {result.url} · {result.hint}
            </div>
            <pre className="bg-zinc-900/60 border border-white/[0.04] rounded-lg p-2 text-[10px] text-zinc-300 overflow-auto max-h-60 font-mono whitespace-pre-wrap break-all">
{result.peek || '(empty)'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 대시보드 컴포넌트 ───────────────────────────────────────

function ServerStatusCard({ data, latencyMs }) {
  const fmtUptime = (sec) => {
    if (sec == null) return '—';
    if (sec < 60) return `${sec}초`;
    if (sec < 3600) return `${Math.floor(sec / 60)}분`;
    if (sec < 86400) {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      return `${h}h${String(m).padStart(2, '0')}`;
    }
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    return `${d}일 ${h}h`;
  };
  const fmtMB = (b) => b == null ? '—' : `${(b / 1024 / 1024).toFixed(0)}MB`;
  const fmtGB = (b) => b == null ? '—' : `${(b / 1024 / 1024 / 1024).toFixed(1)}GB`;
  const fmtAgo = (iso) => {
    if (!iso) return '—';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 0) return '미래?';
    if (ms < 60_000) return `${Math.floor(ms / 1000)}초 전`;
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}분 전`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h 전`;
    return `${Math.floor(ms / 86_400_000)}일 전`;
  };
  const freshColor = (iso) => {
    if (!iso) return 'text-zinc-500';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 5 * 60_000)  return 'text-emerald-400';
    if (ms < 30 * 60_000) return 'text-amber-400';
    return 'text-rose-400';
  };

  const skew = data.serverTime ? Date.now() - data.serverTime - (latencyMs || 0) / 2 : null;
  const skewColor = skew == null ? 'text-zinc-500'
    : Math.abs(skew) < 5_000  ? 'text-emerald-400'
    : Math.abs(skew) < 30_000 ? 'text-amber-400'
    : 'text-rose-400';

  const memUsedPct = data.host?.memTotal
    ? Math.round((1 - data.host.memFree / data.host.memTotal) * 100) : null;
  const load = data.host?.loadavg || [];
  const loadColor = load[0] != null && data.host?.cpuCount
    ? (load[0] / data.host.cpuCount > 1 ? 'text-rose-400'
       : load[0] / data.host.cpuCount > 0.7 ? 'text-amber-400'
       : 'text-emerald-400')
    : 'text-zinc-300';

  const Item = ({ label, children, valClass = 'text-zinc-200' }) => (
    <div>
      <div className="text-[9px] text-zinc-600">{label}</div>
      <div className={`${valClass} font-semibold`}>{children}</div>
    </div>
  );

  return (
    <div className="space-y-2">
      {/* 핵심 그리드 */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] tabular-nums">
        <Item label="가동 시간 (앱)">{fmtUptime(data.uptimeSec)}</Item>
        <Item label="DB 응답"
              valClass={data.db?.ok ? 'text-emerald-400' : 'text-rose-400'}>
          {data.db?.ok ? `✓ ${data.db.latencyMs}ms` : `✕ ${data.db?.error || '—'}`}
        </Item>
        <Item label="TeslaMate 최신" valClass={freshColor(data.db?.latestPosition)}>
          {fmtAgo(data.db?.latestPosition)}
        </Item>
        <Item label="시계 차이" valClass={skewColor}>
          {skew == null ? '—' : `${skew >= 0 ? '+' : ''}${Math.abs(skew) >= 1000 ? `${(skew / 1000).toFixed(1)}s` : `${Math.round(skew)}ms`}`}
        </Item>
        <Item label="메모리 (RSS·힙)">
          {fmtMB(data.memory?.rss)}<span className="text-[9px] text-zinc-600 ml-1">힙 {fmtMB(data.memory?.heapUsed)}</span>
        </Item>
        <Item label="시스템 메모리"
              valClass={memUsedPct != null && memUsedPct > 90 ? 'text-rose-400'
                       : memUsedPct != null && memUsedPct > 75 ? 'text-amber-400'
                       : 'text-zinc-200'}>
          {memUsedPct != null ? `${memUsedPct}%` : '—'}
          <span className="text-[9px] text-zinc-600 ml-1">{fmtGB(data.host?.memTotal)} 중</span>
        </Item>
        <Item label="CPU 부하 (1m)" valClass={loadColor}>
          {load[0] != null ? load[0].toFixed(2) : '—'}
          {data.host?.cpuCount && <span className="text-[9px] text-zinc-600 ml-1">/ {data.host.cpuCount}코어</span>}
        </Item>
        <Item label="DB pool">
          {data.db?.poolStats
            ? `t${data.db.poolStats.total} i${data.db.poolStats.idle} w${data.db.poolStats.waiting}`
            : '—'}
        </Item>
      </div>

      {/* DB freshness 추가 */}
      <div className="border-t border-white/[0.04] pt-2 grid grid-cols-3 gap-x-2 text-[10px] tabular-nums">
        <Item label="latest drive" valClass={freshColor(data.db?.latestDrive)}>
          {fmtAgo(data.db?.latestDrive)}
        </Item>
        <Item label="latest charge" valClass={freshColor(data.db?.latestCharge)}>
          {fmtAgo(data.db?.latestCharge)}
        </Item>
        <Item label="cars">
          {data.db?.carCount ?? '—'}
        </Item>
      </div>

      {/* 호스트/프로세스 메타 */}
      <div className="border-t border-white/[0.04] pt-2 text-[10px] text-zinc-500 leading-relaxed font-mono break-all">
        {data.host?.hostname && <div>host: <span className="text-zinc-300">{data.host.hostname}</span> · {data.host.platform}/{data.host.arch} · {data.host.cpuCount}× <span className="text-zinc-600">{(data.host.cpuModel || '').replace(/\s+/g, ' ').slice(0, 40)}</span></div>}
        <div>node: <span className="text-zinc-300">{data.node}</span> · v8 {data.process?.v8} · pid {data.process?.pid} · env <span className="text-zinc-300">{data.env}</span></div>
        <div>cpu: user {data.process?.cpuUserSec}s + sys {data.process?.cpuSysSec}s · host uptime {fmtUptime(data.host?.uptime)}</div>
        {data.db?.version && <div>db: <span className="text-zinc-400">{String(data.db.version).slice(0, 80)}</span></div>}
      </div>
    </div>
  );
}

function ChargingDiagPanel({ data }) {
  const dbg = data.debug || {};
  const Cell = ({ label, value, valueClass = 'text-zinc-200' }) => (
    <div className="flex items-baseline gap-1">
      <span className="text-zinc-600">{label}=</span>
      <span className={`${valueClass} font-mono`}>{value}</span>
    </div>
  );
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] tabular-nums">
      <Cell label="charging" value={String(!!data.charging)}
            valueClass={data.charging ? 'text-emerald-400' : 'text-zinc-400'} />
      {data.fallback && <Cell label="fb" value={data.fallback_reason || 'true'} valueClass="text-amber-400" />}
      <Cell label="pwr" value={dbg.latest_power ?? 'null'} />
      <Cell label="lvl" value={`${dbg.recent_level ?? 'null'}→${dbg.older_level ?? 'null'}`} />
      <Cell label="pSig" value={String(dbg.power_signal)}
            valueClass={dbg.power_signal ? 'text-emerald-400' : 'text-zinc-400'} />
      <Cell label="lSig" value={String(dbg.level_signal)}
            valueClass={dbg.level_signal ? 'text-emerald-400' : 'text-zinc-400'} />
      {data.battery_level != null && <Cell label="soc" value={`${data.battery_level}%`} />}
      {data.charge_power != null && <Cell label="kW" value={data.charge_power} />}
    </div>
  );
}
