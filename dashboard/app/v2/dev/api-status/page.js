'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { WarmDiagCard } from '@/app/v2/battery/home-charger/poll-log/diag';

// ── 라우트 메타데이터 ─────────────────────────────────────────
// dashboard: 펼침 시 raw peek 위에 추가로 보여줄 대시보드 ('server' | 'charging' | 'poll')
// params[].sample 의 'auto:firstDriveId' 는 마운트 시 /api/drives 응답에서 자동 픽
// /api/server-status 는 ROUTES 에서 제외 — 상단 항상-표시 카드(`서버` 섹션)
// 가 동일 엔드포인트를 30초 자동 갱신해 그림. 카테고리 행으로 또 두면 중복.
const ROUTES = [
  // 차량
  { path: '/api/car',              label: '차량',           desc: '현재 상태(주차/주행/충전) + SOC·범위·위치 + 추천 충전일', category: '차량' },
  { path: '/api/drives',           label: '주행 요약',      desc: '최근 주행 목록 + 거리/시간/효율 (from·to 로 기간 필터)', category: '차량',
    params: [
      { key: 'from', sample: '' },
      { key: 'to',   sample: '' },
    ] },
  { path: '/api/insights',         label: '인사이트',       desc: '누적 거리·kWh·평균효율·요약 통계', category: '차량' },

  // 주행
  { path: '/api/route-map',        label: '경로 지도',      desc: '단일 주행의 polyline + start/end + 통계 (driveId 필수)', category: '주행',
    params: [
      { key: 'driveId', required: true, sample: 'auto:firstDriveId' },
      { key: 'detail',  sample: '' },
    ] },
  { path: '/api/heatmap',          label: '히트맵',         desc: '전체 위치 좌표 다운샘플링 → 빈도 히트맵 입력', category: '주행' },
  { path: '/api/year-heatmap',     label: '연간 히트맵',    desc: '최근 1년 일별 주행/충전 집계 (캘린더 셀)', category: '주행' },
  { path: '/api/monthly-history',  label: '월간 이력',      desc: '월별 주행거리/충전량/효율 집계', category: '주행' },
  { path: '/api/frequent-places',  label: '자주 가는 곳',   desc: '지오펜스 도착 빈도 + 카카오 reverse geocode (집/회사 우선 핀)', category: '주행' },
  { path: '/api/rankings',         label: '랭킹',           desc: '주행/일자별 TOP N (type=거리·시간·평속·효율)', category: '주행',
    params: [
      { key: 'type',  sample: 'drive_distance' },
      { key: 'limit', sample: '30' },
    ] },

  // 배터리
  { path: '/api/battery',          label: '배터리',         desc: 'SOC 종합 — 용량·체류 분포·주간/월간 충방전·추정 잔여', category: '배터리' },
  { path: '/api/battery-trend',    label: '배터리 추이',    desc: 'SOC 시계열 (라인 차트용 다운샘플링)', category: '배터리' },
  { path: '/api/charges',          label: '충전 기록',      desc: '최근 충전 세션 목록 (시작 SOC → 종료 SOC, kWh, 위치)', category: '배터리' },
  { path: '/api/charge-all-time',  label: '충전 전기간',    desc: '전기간 누적 충전 통계 (총 kWh, 횟수, 평균)', category: '배터리' },
  { path: '/api/charging-status',  label: '충전 상태',      desc: '현재 충전 중 여부 + power/level 신호 + 폴백 진단', category: '배터리', dashboard: 'charging' },
  { path: '/api/fast-charges',     label: '급속 기록',      desc: 'DC 급속(>50kW) 충전 세션 필터', category: '배터리' },
  { path: '/api/slow-charges',     label: '완속 기록',      desc: 'AC 완속 충전 세션 필터', category: '배터리' },
  { path: '/api/debug/charging',   label: '디버그 · 충전',  desc: '충전 감지 raw 신호 (positions.power, charges 행, states)', category: '배터리' },

  // 집충전기
  { path: '/api/home-charger',                  label: '집충전기',         desc: '환경공단 API 사용량 (캐시 우선, refresh=1로 강제 갱신)', category: '집충전기',
    params: [{ key: 'refresh', sample: '' }] },
  { path: '/api/home-charger/fleet-stats',      label: '집충전기 누적',    desc: '등록된 모든 집충전기 월별 누적 (months 로 기간)', category: '집충전기',
    params: [{ key: 'months', sample: '' }] },
  { path: '/api/home-charger/poll-log',         label: '집충전기 로그',    desc: '폴링 루프 로그 + warm 진단 (view=hourly/daily/raw)', category: '집충전기', dashboard: 'poll',
    params: [
      { key: 'view', sample: 'hourly' },
      { key: 'days', sample: '' },
      { key: 'date', sample: '' },
    ] },
  { path: '/api/find-nearby-chargers',          label: '주변 충전소',      desc: '좌표/주소 기반 주변 충전소 탐색 (1회성 조사)', category: '집충전기',
    params: [
      { key: 'radius', sample: '' },
      { key: 'count',  sample: '' },
      { key: 'addr',   sample: '' },
      { key: 'name',   sample: '' },
    ] },
];

const CATEGORIES = ['차량', '주행', '배터리', '집충전기'];

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

export default function ApiStatusPage() {
  const [results, setResults] = useState({});
  const [paramValues, setParamValues] = useState({});
  const [expanded, setExpanded] = useState({});
  const [editing, setEditing] = useState({});
  const [autoDriveId, setAutoDriveId] = useState(null);
  const [autoErr, setAutoErr] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [serverData, setServerData] = useState(null);
  const [serverLatency, setServerLatency] = useState(null);
  const [serverErr, setServerErr] = useState(null);
  const [serverHistory, setServerHistory] = useState([]); // 최근 N 샘플 — 스파크라인용
  const runIdRef = useRef(0);

  // 서버 상태 — 페이지 진입 시 즉시 + 30초 주기 자동 갱신
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const t0 = performance.now();
      try {
        const res = await fetch('/api/server-status', { cache: 'no-store' });
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch {}
        if (!alive) return;
        if (!res.ok) {
          setServerErr(data?.error || `HTTP ${res.status}`);
        } else {
          const latency = performance.now() - t0;
          setServerData(data);
          setServerLatency(latency);
          setServerErr(null);
          setServerHistory(prev => {
            const containers = data.docker?.containers || [];
            const findC = (n) => containers.find(c => c.name === n);
            const tm = findC('teslamate');
            const dash = findC('dashboard');
            const sample = {
              ts: Date.now(),
              hostCpu: data.host?.loadavg?.[0] ?? null,
              hostMemPct: data.host?.memTotal
                ? (1 - data.host.memFree / data.host.memTotal) * 100
                : null,
              dbMs: data.db?.latencyMs ?? null,
              tmCpu: tm?.cpuPct ?? null,
              tmMemMB: tm?.memUsage != null ? tm.memUsage / 1024 / 1024 : null,
              dashCpu: dash?.cpuPct ?? null,
              dashMemMB: dash?.memUsage != null ? dash.memUsage / 1024 / 1024 : null,
            };
            return [...prev, sample].slice(-30); // 30 샘플 × 30초 = 15분 트렌드
          });
        }
      } catch (e) {
        if (alive) setServerErr(e?.message || 'fetch 실패');
      }
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

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

        {/* Hero — 전체 상태 한 줄 + 진행 바 */}
        {(() => {
          const overall =
            counts.fail > 0 ? 'fail'
            : counts.slow > 0 ? 'slow'
            : counts.running > 0 ? 'running'
            : counts.idle === ROUTES.length ? 'idle'
            : counts.idle > 0 ? 'partial'
            : 'ok';
          const cfg = {
            ok:      { label: '정상',   dot: 'bg-emerald-400', halo: 'bg-emerald-500/15', pulse: true },
            slow:    { label: '느림',   dot: 'bg-amber-400',   halo: 'bg-amber-500/15',   pulse: false },
            fail:    { label: '오류',   dot: 'bg-rose-400',    halo: 'bg-rose-500/15',    pulse: false },
            running: { label: '실행 중', dot: 'bg-blue-400',    halo: 'bg-blue-500/15',    pulse: true },
            partial: { label: '부분',   dot: 'bg-zinc-400',    halo: 'bg-zinc-500/15',    pulse: false },
            idle:    { label: '대기',   dot: 'bg-zinc-600',    halo: 'bg-zinc-700/30',    pulse: false },
          }[overall];
          return (
            <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
                    <span className={`absolute inset-0 rounded-full ${cfg.halo} ${cfg.pulse ? 'animate-pulse' : ''}`} />
                    <span className={`relative w-3 h-3 rounded-full ${cfg.dot}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl font-light tracking-tight">{cfg.label}</div>
                    <div className="text-[11px] text-zinc-500 tabular-nums mt-0.5">
                      <span className="text-zinc-300">{counts.ok}</span>
                      <span className="text-zinc-600"> / {ROUTES.length} OK</span>
                      {counts.slow > 0 && <span className="ml-2.5 text-amber-400">⚠ {counts.slow}</span>}
                      {counts.fail > 0 && <span className="ml-2.5 text-rose-400">✕ {counts.fail}</span>}
                      {counts.idle > 0 && counts.idle < ROUTES.length && <span className="ml-2.5 text-zinc-600">○ {counts.idle}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <button
                    onClick={runAll}
                    className="px-3 py-1.5 rounded-full bg-white/[0.05] hover:bg-white/[0.08] active:bg-white/[0.10] text-zinc-300 text-[11px] font-medium flex items-center gap-1.5"
                  >
                    <span className="text-[13px]">↻</span>
                    <span>재실행</span>
                  </button>
                  <span className="text-[10px] text-zinc-600 tabular-nums">
                    {lastRun ? new Date(lastRun).toLocaleTimeString('ko-KR', { hour12: false }) : '미실행'}
                  </span>
                </div>
              </div>

              {/* 진행 바 — OK / slow / fail / idle 비율 */}
              <div className="mt-4 h-1 rounded-full bg-white/[0.04] overflow-hidden flex">
                {counts.ok   > 0 && <div className="h-full bg-emerald-500/70" style={{ width: `${(counts.ok   / ROUTES.length) * 100}%` }} />}
                {counts.slow > 0 && <div className="h-full bg-amber-500/70"   style={{ width: `${(counts.slow / ROUTES.length) * 100}%` }} />}
                {counts.fail > 0 && <div className="h-full bg-rose-500/70"    style={{ width: `${(counts.fail / ROUTES.length) * 100}%` }} />}
              </div>

              {autoErr && (
                <div className="mt-3 text-[10px] text-zinc-600">
                  driveId: <span className="text-rose-400">{autoErr}</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* 서버 상태 — 항상 상단 노출, 30초 자동 갱신 */}
        <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-3">
          <div className="text-[11px] font-bold tracking-widest uppercase text-zinc-500 mb-2">서버</div>
          {serverData ? (
            <ServerStatusCard data={serverData} latencyMs={serverLatency} history={serverHistory} />
          ) : serverErr ? (
            <div className="text-[11px] text-rose-300">로딩 실패 — {serverErr}</div>
          ) : (
            <div className="text-[11px] text-zinc-500">로딩 중…</div>
          )}
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
  const hasParams = !!route.params?.length;
  const missingRequired = route.params?.some(p => p.required && !values[p.key]);

  const dotCls = {
    ok:      'bg-emerald-400',
    slow:    'bg-amber-400',
    fail:    'bg-rose-400',
    running: 'bg-blue-400 animate-pulse',
    idle:    'bg-zinc-700',
  }[state];

  const msCls =
    state === 'fail' ? 'text-rose-400'
    : state === 'slow' ? 'text-amber-400'
    : 'text-zinc-500';

  return (
    <div className="border-b border-white/[0.04] last:border-0">
      <div className="flex items-stretch">
        <button
          onClick={() => {
            const willExpand = !expanded;
            onToggleExpand();
            if (willExpand && (state === 'idle' || state === 'fail') && !missingRequired) {
              onRun();
            }
          }}
          className="flex-1 min-w-0 px-4 py-3 flex items-center gap-3 text-left active:bg-white/[0.02]"
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotCls}`} aria-label={state} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-[13px] font-medium text-zinc-100 truncate">{route.label}</span>
              <span className="text-[10px] font-mono text-zinc-600 truncate">{route.path}</span>
            </div>
            {route.desc && (
              <div className="text-[11px] text-zinc-500 mt-0.5 truncate">{route.desc}</div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {state === 'running' ? (
              <span className="text-[11px] text-blue-400 tabular-nums">…</span>
            ) : state !== 'idle' ? (
              <span className={`text-[11px] tabular-nums ${msCls}`}>{fmtMs(result.ms)}</span>
            ) : missingRequired ? (
              <span className="text-[10px] text-amber-500/70">파라미터 필요</span>
            ) : null}
            <span className={`text-zinc-600 text-base shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>
          </div>
        </button>
        {hasParams && (
          <button
            onClick={onToggleEdit}
            className={`px-3 flex items-center justify-center text-base active:bg-white/[0.05] ${editing ? 'text-blue-300' : 'text-zinc-600 hover:text-zinc-300'}`}
            title="파라미터 편집"
            aria-label="파라미터 편집"
          >
            ✎
          </button>
        )}
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
      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {state === 'running' && (
            <div className="text-[11px] text-blue-400 flex items-center gap-2 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              실행 중...
            </div>
          )}

          {state === 'idle' && (
            <div className="flex items-center justify-between text-[11px] text-zinc-500 py-1">
              <span>대기 중</span>
              <button
                onClick={onRun}
                disabled={missingRequired}
                className="text-blue-400 hover:text-blue-300 disabled:opacity-40"
              >
                {missingRequired ? '필수 파라미터 없음' : '실행 →'}
              </button>
            </div>
          )}

          {result && state !== 'idle' && state !== 'running' && (
            <>
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
                <div className="flex items-center justify-between text-[10px] text-zinc-600 mb-1 tabular-nums">
                  <span className="truncate">
                    <span className={result.status >= 400 ? 'text-rose-400' : result.status >= 300 ? 'text-amber-400' : 'text-zinc-500'}>
                      {result.status ?? 'ERR'}
                    </span>
                    <span className="ml-2">{result.url}</span>
                    <span className="ml-2">· {result.hint}</span>
                  </span>
                  <button
                    onClick={onRun}
                    disabled={state === 'running' || missingRequired}
                    className="ml-2 shrink-0 px-2 py-0.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
                  >
                    ↻ 재실행
                  </button>
                </div>
                <pre className="bg-zinc-900/60 border border-white/[0.04] rounded-lg p-2 text-[10px] text-zinc-300 overflow-auto max-h-60 font-mono whitespace-pre-wrap break-all">
{result.peek || '(empty)'}
                </pre>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── 대시보드 컴포넌트 ───────────────────────────────────────

// 미니 스파크라인 — 30 샘플 × 30초 = 최근 15분 트렌드
function Sparkline({ values, color = '#52525b', width = 44, height = 12 }) {
  const valid = values?.filter(v => v != null) || [];
  if (valid.length < 2) return null;
  const lo = Math.min(...valid);
  const hi = Math.max(...valid);
  const range = hi - lo || 1;
  const stepX = width / Math.max(1, values.length - 1);
  const pts = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    const x = i * stepX;
    const y = height - ((v - lo) / range) * height;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return (
    <svg width={width} height={height} className="inline-block ml-1.5 align-middle opacity-80" aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function ServerStatusCard({ data, latencyMs, history }) {
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

  // 컨테이너 stats — docker.sock 미마운트면 docker.ok = false
  const containers = data.docker?.ok ? (data.docker.containers || []) : [];
  const findContainer = (name) => containers.find(c => c.name === name);
  const tm = findContainer('teslamate');
  const dash = findContainer('dashboard');

  // 메모리% 색
  const memPctColor = (pct) => pct == null ? 'text-zinc-300'
    : pct > 90 ? 'text-rose-400'
    : pct > 75 ? 'text-amber-400'
    : 'text-zinc-200';

  // 컨테이너 메모리% (limit 대비)
  const containerMemPct = (c) => c?.memUsage != null && c?.memLimit
    ? Math.round((c.memUsage / c.memLimit) * 100) : null;

  const tmMemPct = containerMemPct(tm);
  const dashMemPct = containerMemPct(dash);

  // 미니 패널 — 헤더 + CPU + Mem + 트렌드 두 줄
  const ResourcePanel = ({ title, cpuLabel, cpuValue, cpuColor, cpuTrend, memLabel, memValue, memColor, memTrend, footnote }) => (
    <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-2.5 flex flex-col gap-1.5 min-w-0">
      <div className="text-[10px] font-bold text-zinc-400 truncate">{title}</div>
      <div className="space-y-0.5 min-w-0">
        <div className="text-[9px] text-zinc-600">{cpuLabel}</div>
        <div className={`text-[12px] font-semibold tabular-nums flex items-center gap-1 ${cpuColor}`}>
          <span className="truncate">{cpuValue}</span>
          {cpuTrend && <Sparkline values={cpuTrend} color="#f59e0b" width={36} />}
        </div>
      </div>
      <div className="space-y-0.5 min-w-0">
        <div className="text-[9px] text-zinc-600">{memLabel}</div>
        <div className={`text-[12px] font-semibold tabular-nums flex items-center gap-1 ${memColor}`}>
          <span className="truncate">{memValue}</span>
          {memTrend && <Sparkline values={memTrend} color="#3b82f6" width={36} />}
        </div>
      </div>
      {footnote && <div className="text-[9px] text-zinc-600 truncate">{footnote}</div>}
    </div>
  );

  return (
    <div className="space-y-2.5">
      {/* 3열: 서버 (호스트) | 테슬라메이트 | 우리서비스 — CPU/Mem + 15분 트렌드 */}
      <div className="grid grid-cols-3 gap-2">
        <ResourcePanel
          title="서버 (호스트)"
          cpuLabel={`CPU 부하 (1m / ${data.host?.cpuCount ?? '?'}코어)`}
          cpuValue={load[0] != null ? load[0].toFixed(2) : '—'}
          cpuColor={loadColor}
          cpuTrend={history?.map(h => h.hostCpu)}
          memLabel="메모리"
          memValue={memUsedPct != null ? `${memUsedPct}%` : '—'}
          memColor={memPctColor(memUsedPct)}
          memTrend={history?.map(h => h.hostMemPct)}
          footnote={data.host?.memTotal ? `${fmtGB(data.host.memTotal)} 중 사용` : null}
        />
        <ResourcePanel
          title="테슬라메이트"
          cpuLabel="CPU"
          cpuValue={tm?.cpuPct != null ? `${tm.cpuPct.toFixed(1)}%`
            : !data.docker?.ok ? '미연결'
            : tm ? '—' : '없음'}
          cpuColor={tm?.cpuPct == null ? 'text-zinc-500' : memPctColor(tm.cpuPct)}
          cpuTrend={tm ? history?.map(h => h.tmCpu) : null}
          memLabel="메모리"
          memValue={tm?.memUsage != null ? `${fmtMB(tm.memUsage)}${tmMemPct != null ? ` (${tmMemPct}%)` : ''}` : '—'}
          memColor={memPctColor(tmMemPct)}
          memTrend={tm ? history?.map(h => h.tmMemMB) : null}
          footnote={tm?.state ? `state: ${tm.state}` : !data.docker?.ok ? data.docker?.error?.slice(0, 40) : null}
        />
        <ResourcePanel
          title="우리서비스 (대시보드)"
          cpuLabel={dash ? 'CPU (컨테이너)' : 'CPU (프로세스 누적)'}
          cpuValue={dash?.cpuPct != null ? `${dash.cpuPct.toFixed(1)}%`
            : `user ${data.process?.cpuUserSec ?? 0}s`}
          cpuColor={dash?.cpuPct == null ? 'text-zinc-300' : memPctColor(dash.cpuPct)}
          cpuTrend={dash ? history?.map(h => h.dashCpu) : null}
          memLabel="메모리 (RSS)"
          memValue={dash?.memUsage != null
            ? `${fmtMB(dash.memUsage)}${dashMemPct != null ? ` (${dashMemPct}%)` : ''}`
            : fmtMB(data.memory?.rss)}
          memColor={memPctColor(dashMemPct)}
          memTrend={dash ? history?.map(h => h.dashMemMB) : null}
          footnote={`힙 ${fmtMB(data.memory?.heapUsed)} / 가동 ${fmtUptime(data.uptimeSec)}`}
        />
      </div>

      {/* DB · 시계 · TeslaMate freshness — 한 줄 */}
      <div className="border-t border-white/[0.04] pt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] tabular-nums">
        <Item label="DB 응답"
              valClass={data.db?.ok ? 'text-emerald-400' : 'text-rose-400'}>
          {data.db?.ok ? `✓ ${data.db.latencyMs}ms` : `✕ ${data.db?.error || '—'}`}
          {data.db?.ok && <Sparkline values={history?.map(h => h.dbMs)} color="#10b981" />}
        </Item>
        <Item label="TeslaMate 최신" valClass={freshColor(data.db?.latestPosition)}>
          {fmtAgo(data.db?.latestPosition)}
        </Item>
        <Item label="DB pool">
          {data.db?.poolStats
            ? `t${data.db.poolStats.total} i${data.db.poolStats.idle} w${data.db.poolStats.waiting}`
            : '—'}
        </Item>
        <Item label="시계 차이" valClass={skewColor}>
          {skew == null ? '—' : `${skew >= 0 ? '+' : ''}${Math.abs(skew) >= 1000 ? `${(skew / 1000).toFixed(1)}s` : `${Math.round(skew)}ms`}`}
        </Item>
      </div>

      {/* DB freshness 보조 */}
      <div className="grid grid-cols-3 gap-x-2 text-[10px] tabular-nums">
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
