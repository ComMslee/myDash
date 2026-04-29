'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { WarmDiagCard } from '@/app/v2/battery/home-charger/poll-log/diag';

// ── 라우트 메타데이터 ─────────────────────────────────────────
// params[].sample 의 'auto:firstDriveId' 는 마운트 시 /api/drives 응답에서 자동 픽
const ROUTES = [
  // 시스템
  { path: '/api/server-status',    label: '서버 상태',       category: '시스템' },

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
  { path: '/api/charging-status',  label: '충전 상태',      category: '배터리' },
  { path: '/api/fast-charges',     label: '급속 기록',      category: '배터리' },
  { path: '/api/slow-charges',     label: '완속 기록',      category: '배터리' },
  { path: '/api/debug/charging',   label: '디버그 · 충전',  category: '배터리' },

  // 집충전기
  { path: '/api/home-charger',                  label: '집충전기',         category: '집충전기',
    params: [{ key: 'refresh', sample: '' }] },
  { path: '/api/home-charger/fleet-stats',      label: '집충전기 누적',    category: '집충전기',
    params: [{ key: 'months', sample: '' }] },
  { path: '/api/home-charger/poll-log',         label: '집충전기 로그',    category: '집충전기',
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
  if (!text) return { kind: 'empty', hint: '—', peek: '' };
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    return { kind: 'text', hint: `${text.length}자`, peek: text.slice(0, 500) };
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
  // path → result
  const [results, setResults] = useState({});
  // path → param values
  const [paramValues, setParamValues] = useState({});
  // path → expanded?
  const [expanded, setExpanded] = useState({});
  // path → 편집 모드?
  const [editing, setEditing] = useState({});
  const [autoDriveId, setAutoDriveId] = useState(null);
  const [autoErr, setAutoErr] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const runIdRef = useRef(0);

  // 진단 패널 상태
  const [chargingDiag, setChargingDiag] = useState(null);
  const [pollDiag, setPollDiag] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagErr, setDiagErr] = useState({ charging: null, poll: null });
  const [diagAt, setDiagAt] = useState(null);

  // 서버 상태
  const [serverStatus, setServerStatus] = useState(null);
  const [serverErr, setServerErr] = useState(null);
  const [serverLatencyMs, setServerLatencyMs] = useState(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverFetchedAt, setServerFetchedAt] = useState(null);

  // 마운트 시 driveId 자동 픽 — /api/drives → recent_drives[0].id
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

  // sample 채우기 — autoDriveId 정해지면 빈 driveId 자리에만 주입 (사용자 편집은 보존)
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
      };
      // race 가드 — 새 runAll 도중 stale 결과 덮지 않게
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
          runId: myRun,
        },
      }));
    }
  }

  async function runAll() {
    setLastRun(Date.now());
    await Promise.allSettled([
      ...ROUTES.map(r => runOne(r)),
      loadDiag(),
      loadServerStatus(),
    ]);
  }

  async function loadServerStatus() {
    setServerLoading(true);
    const t0 = performance.now();
    try {
      const res = await fetch('/api/server-status', { cache: 'no-store' });
      const data = await res.json();
      setServerLatencyMs(Math.round(performance.now() - t0));
      if (!res.ok || data?.error) {
        setServerErr(data?.error || `HTTP ${res.status}`);
        setServerStatus(null);
      } else {
        setServerStatus(data);
        setServerErr(null);
      }
    } catch (e) {
      setServerLatencyMs(Math.round(performance.now() - t0));
      setServerErr(e.message || 'fetch 실패');
      setServerStatus(null);
    } finally {
      setServerFetchedAt(Date.now());
      setServerLoading(false);
    }
  }

  async function loadDiag() {
    setDiagLoading(true);
    const [cs, pl] = await Promise.allSettled([
      fetch('/api/charging-status', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/home-charger/poll-log', { cache: 'no-store' }).then(r => r.json()),
    ]);
    const errs = { charging: null, poll: null };
    if (cs.status === 'fulfilled') {
      if (cs.value?.error) errs.charging = cs.value.error;
      else setChargingDiag(cs.value);
    } else errs.charging = cs.reason?.message || 'fetch 실패';
    if (pl.status === 'fulfilled') {
      if (pl.value?.error) errs.poll = pl.value.error;
      else setPollDiag(pl.value);
    } else errs.poll = pl.reason?.message || 'fetch 실패';
    setDiagErr(errs);
    setDiagAt(Date.now());
    setDiagLoading(false);
  }

  // 마운트 시 1회 진단 + 서버 상태 호출
  useEffect(() => { loadDiag(); loadServerStatus(); }, []);

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 py-5 pb-24 flex flex-col gap-4">

        {/* 서버 상태 — 최상단 */}
        <ServerStatusCard
          status={serverStatus}
          err={serverErr}
          latencyMs={serverLatencyMs}
          loading={serverLoading}
          fetchedAt={serverFetchedAt}
          onReload={loadServerStatus}
        />

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

        {/* 진단 패널 */}
        <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="px-4 py-2 border-b border-white/[0.06] flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-widest uppercase text-zinc-500">진단</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-600 tabular-nums">
                {diagAt ? new Date(diagAt).toLocaleTimeString('ko-KR') : '미실행'}
              </span>
              <button
                onClick={loadDiag}
                disabled={diagLoading}
                className="px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-[10px] text-zinc-300 disabled:opacity-30"
              >
                {diagLoading ? '…' : '갱신'}
              </button>
            </div>
          </div>

          {/* 충전 감지 진단 — GlobalHeader 10연타 디버그 바와 동일 데이터 */}
          <div className="px-4 py-3 border-b border-white/[0.04]">
            <div className="text-[10px] text-zinc-500 mb-1.5">충전 감지 — /api/charging-status</div>
            {diagErr.charging ? (
              <div className="text-[11px] text-rose-400">{diagErr.charging}</div>
            ) : !chargingDiag ? (
              <div className="text-[11px] text-zinc-600">로딩…</div>
            ) : (
              <ChargingDiagPanel data={chargingDiag} />
            )}
          </div>

          {/* 폴링 루프 진단 — WarmDiagCard 재사용 */}
          <div className="px-4 py-3">
            <div className="text-[10px] text-zinc-500 mb-1.5">폴링 루프 — /api/home-charger/poll-log</div>
            {diagErr.poll ? (
              <div className="text-[11px] text-rose-400">{diagErr.poll}</div>
            ) : !pollDiag?.warmDiag ? (
              <div className="text-[11px] text-zinc-600">{pollDiag ? 'warmDiag 필드 없음' : '로딩…'}</div>
            ) : (
              <WarmDiagCard diag={pollDiag.warmDiag} />
            )}
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

      {/* 펼침 — peek */}
      {expanded && result && state !== 'idle' && state !== 'running' && (
        <div className="px-4 pb-3">
          <div className="text-[10px] text-zinc-600 mb-1 tabular-nums">
            {result.url} · {result.hint}
          </div>
          <pre className="bg-zinc-900/60 border border-white/[0.04] rounded-lg p-2 text-[10px] text-zinc-300 overflow-auto max-h-60 font-mono whitespace-pre-wrap break-all">
{result.peek || '(empty)'}
          </pre>
        </div>
      )}
    </div>
  );
}

// 서버 상태 카드 — 최상단
function ServerStatusCard({ status, err, latencyMs, loading, fetchedAt, onReload }) {
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
  const fmtMemMB = (b) => b == null ? '—' : `${(b / 1024 / 1024).toFixed(0)}MB`;
  const fmtAgo = (iso) => {
    if (!iso) return '—';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 0) return '미래?';
    if (ms < 60_000) return `${Math.floor(ms / 1000)}초 전`;
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}분 전`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h 전`;
    return `${Math.floor(ms / 86_400_000)}일 전`;
  };

  // 데이터 신선도 임계 — 5분 이내 emerald, 30분 이내 amber, 그 이상 rose
  const freshnessColor = (() => {
    if (!status?.db?.latestPosition) return 'text-zinc-500';
    const ms = Date.now() - new Date(status.db.latestPosition).getTime();
    if (ms < 5 * 60_000) return 'text-emerald-400';
    if (ms < 30 * 60_000) return 'text-amber-400';
    return 'text-rose-400';
  })();

  // 서버 시계 - 클라 시계 차이 (ms) — > 5초면 amber, > 30초면 rose
  const clockSkew = status?.serverTime ? Date.now() - status.serverTime - (latencyMs || 0) / 2 : null;
  const skewColor = clockSkew == null ? 'text-zinc-500'
    : Math.abs(clockSkew) < 5_000 ? 'text-emerald-400'
    : Math.abs(clockSkew) < 30_000 ? 'text-amber-400'
    : 'text-rose-400';

  const overallOk = status && status.db?.ok && !err;

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${
            err ? 'bg-rose-400' : !status ? 'bg-zinc-700' : overallOk ? 'bg-emerald-400' : 'bg-amber-400'
          }`} />
          <span className="text-[11px] font-bold tracking-widest uppercase text-zinc-500">서버 상태</span>
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-600 tabular-nums">
            {fetchedAt ? new Date(fetchedAt).toLocaleTimeString('ko-KR') : '미실행'}
          </span>
          <button
            onClick={onReload}
            disabled={loading}
            className="px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-[10px] text-zinc-300 disabled:opacity-30"
          >
            {loading ? '…' : '갱신'}
          </button>
        </div>
      </div>

      {err ? (
        <div className="px-4 py-3 text-[11px] text-rose-400">{err}</div>
      ) : !status ? (
        <div className="px-4 py-3 text-[11px] text-zinc-600">로딩…</div>
      ) : (
        <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] tabular-nums">
          <div>
            <div className="text-[9px] text-zinc-600">가동 시간</div>
            <div className="text-zinc-200 font-semibold">{fmtUptime(status.uptimeSec)}</div>
          </div>
          <div>
            <div className="text-[9px] text-zinc-600">DB 응답</div>
            <div className={status.db?.ok ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
              {status.db?.ok ? `✓ ${status.db.latencyMs}ms` : `✕ ${status.db?.error || '연결 실패'}`}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-zinc-600">TeslaMate 최신</div>
            <div className={`${freshnessColor} font-semibold`}>{fmtAgo(status.db?.latestPosition)}</div>
          </div>
          <div>
            <div className="text-[9px] text-zinc-600">시계 차이</div>
            <div className={`${skewColor} font-semibold`}>
              {clockSkew == null ? '—' : `${clockSkew >= 0 ? '+' : ''}${clockSkew >= 1000 ? `${(clockSkew / 1000).toFixed(1)}s` : `${Math.round(clockSkew)}ms`}`}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-zinc-600">메모리 (RSS)</div>
            <div className="text-zinc-200 font-semibold">
              {fmtMemMB(status.memory?.rss)}
              <span className="text-[9px] text-zinc-600 ml-1">힙 {fmtMemMB(status.memory?.heapUsed)}</span>
            </div>
          </div>
          <div>
            <div className="text-[9px] text-zinc-600">Node · 환경</div>
            <div className="text-zinc-400 font-mono text-[10px]">{status.node} · {status.env}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// 충전 감지 디버그 패널 — GlobalHeader 10연타 디버그 바와 동일 정보
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
      <Cell label="charging" value={String(!!data.charging)} valueClass={data.charging ? 'text-emerald-400' : 'text-zinc-400'} />
      {data.fallback && <Cell label="fb" value={data.fallback_reason || 'true'} valueClass="text-amber-400" />}
      <Cell label="pwr" value={dbg.latest_power ?? 'null'} />
      <Cell label="lvl" value={`${dbg.recent_level ?? 'null'}→${dbg.older_level ?? 'null'}`} />
      <Cell label="pSig" value={String(dbg.power_signal)} valueClass={dbg.power_signal ? 'text-emerald-400' : 'text-zinc-400'} />
      <Cell label="lSig" value={String(dbg.level_signal)} valueClass={dbg.level_signal ? 'text-emerald-400' : 'text-zinc-400'} />
      {data.battery_level != null && <Cell label="soc" value={`${data.battery_level}%`} />}
      {data.charge_power != null && <Cell label="kW" value={data.charge_power} />}
    </div>
  );
}
