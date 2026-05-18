'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RenderErrorBoundary } from './_components/RenderErrorBoundary';
import { RouteRow } from './_components/RouteRow';
import { ServerStatusCard } from './_components/ServerStatusCard';
import { AggStatusCard } from './_components/AggStatusCard';
import { HeroCard } from './_components/HeroCard';
import { TabBar } from './_components/TabBar';
import { ROUTES, CATEGORIES } from './_routes';
import { SLOW_MS, buildQS, summarizePayload } from './_lib';

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
  const [tab, setTab] = useState('server');
  // 카테고리 접힘 — localStorage 로 영속화. 기본 모두 접힘 (스크롤 길이 단축).
  const [openCats, setOpenCats] = useState(() => new Set());
  const [catsLoaded, setCatsLoaded] = useState(false);
  const runIdRef = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('apiStatus.openCats');
      if (raw) setOpenCats(new Set(JSON.parse(raw)));
    } catch {}
    setCatsLoaded(true);
  }, []);
  useEffect(() => {
    if (!catsLoaded) return;
    try { localStorage.setItem('apiStatus.openCats', JSON.stringify([...openCats])); } catch {}
  }, [openCats, catsLoaded]);

  const toggleCat = (cat) => setOpenCats(prev => {
    const next = new Set(prev);
    if (next.has(cat)) next.delete(cat); else next.add(cat);
    return next;
  });

  // '서버' 탭 활성일 때만 30초 폴링 — 다른 탭에선 cleanup.
  // history 는 /api/server-status 응답의 ring buffer 그대로 사용.
  useEffect(() => {
    if (tab !== 'server') return;
    let alive = true;
    const tick = async () => {
      const t0 = performance.now();
      try {
        const res = await fetch('/api/server-status', { cache: 'no-store' });
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch {}
        if (!alive) return;
        if (!res.ok) setServerErr(data?.error || `HTTP ${res.status}`);
        else {
          setServerData(data);
          setServerLatency(performance.now() - t0);
          setServerErr(null);
        }
      } catch (e) {
        if (alive) setServerErr(e?.message || 'fetch 실패');
      }
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, [tab]);

  // 마운트 시 driveId 자동 픽 (route-map 등 driveId 필수 라우트에 sample 제공)
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

    const url = route.path + buildQS(route.params, paramValues[route.path]);
    const t0 = performance.now();
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const text = await res.text();
      const dt = performance.now() - t0;
      const sum = summarizePayload(text);
      const ok = res.ok && !(sum.parsed && typeof sum.parsed === 'object' && 'error' in sum.parsed);
      const state = !ok ? 'fail' : (dt >= SLOW_MS ? 'slow' : 'ok');
      const result = { state, status: res.status, ms: dt, bytes: text.length, url, hint: sum.hint, peek: sum.peek, parsed: sum.parsed };
      setResults(prev => prev[route.path]?.runId && prev[route.path].runId > myRun
        ? prev
        : { ...prev, [route.path]: { ...result, runId: myRun } });
    } catch (e) {
      const dt = performance.now() - t0;
      setResults(prev => ({
        ...prev,
        [route.path]: {
          state: 'fail', status: null, ms: dt, bytes: null, url,
          hint: 'fetch 실패', peek: String(e?.message || e).slice(0, 800), parsed: null, runId: myRun,
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

        <TabBar tab={tab} onChange={setTab} serverErr={serverErr} counts={counts} />

        {tab === 'api' && (
          <HeroCard
            counts={counts}
            total={ROUTES.length}
            lastRun={lastRun}
            autoErr={autoErr}
            onRunAll={runAll}
          />
        )}

        {tab === 'server' && (
          <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-3">
            {serverData ? (
              <RenderErrorBoundary>
                <ServerStatusCard data={serverData} latencyMs={serverLatency} history={serverData.history || []} />
              </RenderErrorBoundary>
            ) : serverErr ? (
              <div className="text-[11px] text-rose-300">로딩 실패 — {serverErr}</div>
            ) : (
              <div className="text-[11px] text-zinc-500">로딩 중…</div>
            )}
          </div>
        )}

        {tab === 'agg' && (
          <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-4">
            <RenderErrorBoundary>
              <AggStatusCard />
            </RenderErrorBoundary>
          </div>
        )}

        {tab === 'api' && CATEGORIES.map(cat => {
          const list = ROUTES.filter(r => r.category === cat);
          const isOpen = openCats.has(cat);
          const catCounts = list.reduce((acc, r) => {
            const s = results[r.path]?.state || 'idle';
            acc[s] = (acc[s] || 0) + 1;
            return acc;
          }, { ok: 0, slow: 0, fail: 0, idle: 0, running: 0 });
          return (
            <div key={cat} className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
              <button
                onClick={() => toggleCat(cat)}
                className="w-full px-4 py-2.5 flex items-center justify-between gap-2 active:bg-white/[0.02]"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`text-zinc-600 text-base shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
                  <span className="text-[11px] font-bold tracking-widest uppercase text-zinc-300 truncate">{cat}</span>
                  <span className="text-[10px] text-zinc-600 tabular-nums shrink-0">· {list.length}</span>
                </span>
                <span className="flex items-center gap-2 text-[10px] tabular-nums shrink-0">
                  {catCounts.fail > 0 && <span className="text-rose-400">✕ {catCounts.fail}</span>}
                  {catCounts.slow > 0 && <span className="text-amber-400">! {catCounts.slow}</span>}
                  {catCounts.ok > 0 && <span className="text-emerald-400/80">✓ {catCounts.ok}</span>}
                  {catCounts.running > 0 && <span className="text-blue-400">● {catCounts.running}</span>}
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-white/[0.06]">
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
              )}
            </div>
          );
        })}

      </div>
    </main>
  );
}
