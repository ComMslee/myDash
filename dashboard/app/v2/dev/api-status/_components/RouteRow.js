import { WarmDiagCard } from '@/app/v2/battery/home-charger/poll-log/diag';
import { ServerStatusCard } from './ServerStatusCard';
import { ChargingDiagPanel } from './ChargingDiagPanel';
import { Icon } from '@/app/lib/Icons';

function fmtMs(n) {
  if (n == null) return '—';
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(2)}s`;
}

export function RouteRow({ route, result, values, setValue, expanded, onToggleExpand, editing, onToggleEdit, onRun }) {
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
            className={`px-3 flex items-center justify-center active:bg-white/[0.05] ${editing ? 'text-blue-300' : 'text-zinc-600 hover:text-zinc-300'}`}
            title="파라미터 편집"
            aria-label="파라미터 편집"
          >
            <Icon name="pencil" className="w-5 h-5" />
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
