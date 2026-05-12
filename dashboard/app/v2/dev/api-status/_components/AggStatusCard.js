'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/app/lib/Icons';

const SCOPES = [
  { key: 'all',     label: '전체',   hint: '4 테이블 모두' },
  { key: 'daily',   label: '일별',   hint: 'dash_daily_*' },
  { key: 'monthly', label: '월별',   hint: 'dash_monthly_insights' },
  { key: 'top',     label: 'TOP',    hint: 'dash_top_drives_cache' },
  { key: 'places',  label: '장소',   hint: 'dash_place_clusters' },
];

function fmtAge(iso) {
  if (!iso) return '—';
  const ageMs = Date.now() - new Date(iso).getTime();
  if (ageMs < 60_000) return `${Math.floor(ageMs / 1000)}초 전`;
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}분 전`;
  if (ageMs < 86_400_000) return `${Math.floor(ageMs / 3_600_000)}시간 전`;
  return `${Math.floor(ageMs / 86_400_000)}일 전`;
}

function fmtMs(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtBytes(n) {
  if (n == null || n < 0) return '—';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}K`;
  return `${(n / 1024 / 1024).toFixed(1)}M`;
}

function metaSummary(t) {
  if (t.meta?.max_day) {
    return `${t.meta.min_day} ~ ${t.meta.max_day}`;
  }
  if (t.meta?.max_ym != null) {
    const fmt = (n) => `${Math.floor(n / 100)}/${String(n % 100).padStart(2, '0')}`;
    return `${fmt(t.meta.min_ym)} ~ ${fmt(t.meta.max_ym)}`;
  }
  if (t.meta?.latest) {
    const extra = t.meta.total_visits != null ? ` · ${t.meta.total_visits.toLocaleString()}회 방문` : '';
    return `최근 ${fmtAge(t.meta.latest)}${extra}`;
  }
  return '—';
}

export function AggStatusCard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(null); // scope key
  const [lastRefresh, setLastRefresh] = useState(null); // { scope, result, ts }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/agg-status', { cache: 'no-store' });
      const text = await res.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch {}
      if (!res.ok) setErr(parsed?.error || `HTTP ${res.status}`);
      else { setData(parsed); setErr(null); }
    } catch (e) {
      setErr(e?.message || 'fetch 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runRefresh(scope) {
    setRefreshing(scope);
    setLastRefresh(null);
    const t0 = performance.now();
    try {
      const res = await fetch(`/api/admin/refresh-aggs?scope=${scope}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      const text = await res.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch {}
      const dt = performance.now() - t0;
      setLastRefresh({
        scope,
        ok: res.ok,
        ms: dt,
        result: parsed,
        ts: Date.now(),
      });
      // 갱신 후 상태 재조회
      load();
    } catch (e) {
      setLastRefresh({ scope, ok: false, ms: performance.now() - t0, result: { error: e?.message || 'fetch 실패' }, ts: Date.now() });
    } finally {
      setRefreshing(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px] font-medium text-zinc-200">사전집계 상태</div>
          <div className="text-[10px] text-zinc-600 mt-0.5">
            dash_* 테이블 + server-cache 메모리
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-2.5 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.08] text-zinc-400 text-[10px] disabled:opacity-40"
        >
          ↻ 새로고침
        </button>
      </div>

      {err && (
        <div className="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300">
          로딩 실패 — {err}
        </div>
      )}

      {!data && !err && (
        <div className="text-[11px] text-zinc-500">로딩 중…</div>
      )}

      {data && (
        <>
          {/* 테이블 그리드 */}
          <div className="space-y-1">
            {data.tables.map(t => (
              <div key={t.name} className="px-3 py-2 rounded-lg bg-zinc-900/40 border border-white/[0.04] flex items-baseline gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-mono text-zinc-300 truncate">{t.name}</div>
                  <div className="text-[10px] text-zinc-600 truncate mt-0.5">{metaSummary(t)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[12px] tabular-nums text-zinc-200">{t.rows.toLocaleString()}</div>
                  <div className="text-[9px] text-zinc-600 mt-0.5">rows</div>
                </div>
              </div>
            ))}
          </div>

          {/* scope 갱신 버튼 */}
          <div>
            <div className="text-[10px] text-zinc-500 mb-1.5">갱신 (POST /api/admin/refresh-aggs)</div>
            <div className="flex flex-wrap gap-1.5">
              {SCOPES.map(s => {
                const busy = refreshing === s.key;
                const anyBusy = refreshing != null;
                return (
                  <button
                    key={s.key}
                    onClick={() => runRefresh(s.key)}
                    disabled={anyBusy}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-medium tabular-nums border ${
                      busy
                        ? 'bg-blue-500/20 border-blue-400/40 text-blue-300 animate-pulse'
                        : anyBusy
                        ? 'bg-white/[0.02] border-white/[0.04] text-zinc-600'
                        : 'bg-white/[0.05] border-white/[0.06] text-zinc-300 hover:bg-white/[0.08]'
                    }`}
                    title={s.hint}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 마지막 갱신 결과 */}
          {lastRefresh && (
            <div className={`px-3 py-2 rounded-lg border text-[10px] ${
              lastRefresh.ok
                ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
            }`}>
              <div className="flex items-center justify-between mb-1 tabular-nums">
                <span>
                  scope=<span className="font-mono">{lastRefresh.scope}</span>
                  <span className="ml-2 text-zinc-500">{fmtMs(lastRefresh.ms)}</span>
                </span>
                <span className="text-zinc-600">{new Date(lastRefresh.ts).toLocaleTimeString('ko-KR', { hour12: false })}</span>
              </div>
              <pre className="text-[10px] font-mono text-zinc-400 overflow-auto max-h-32 whitespace-pre-wrap break-all">
{JSON.stringify(lastRefresh.result, null, 2)}
              </pre>
            </div>
          )}

          {/* server-cache 상태 */}
          {data.server_cache?.length > 0 && (
            <div>
              <div className="text-[10px] text-zinc-500 mb-1.5">
                server-cache · {data.server_cache.length} 키
              </div>
              <div className="space-y-1">
                {data.server_cache.map(c => (
                  <div key={c.key} className="px-3 py-1.5 rounded-lg bg-zinc-900/40 border border-white/[0.04] flex items-center gap-3 text-[10px] tabular-nums">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.fresh ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                    <span className="font-mono text-zinc-300 flex-1 min-w-0 truncate">{c.key}</span>
                    <span className="text-zinc-500 shrink-0">{Math.floor(c.ageMs / 1000)}s / {Math.floor(c.ttlMs / 1000)}s</span>
                    <span className="text-zinc-600 shrink-0">{fmtBytes(c.sizeApprox)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.server_cache?.length === 0 && (
            <div className="text-[10px] text-zinc-600">server-cache 비어 있음 — 라우트 첫 호출 후 채워짐</div>
          )}
        </>
      )}
    </div>
  );
}
