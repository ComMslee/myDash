'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

// Spotify refresh_token revoke 시 SSH 없이 복구.
// 권장: HTTPS 도메인(sslip.io 등) 으로 접속해 "1클릭 OAuth" 버튼 사용.
// HTTP 환경 fallback: 로컬 PC 에서 bootstrap 스크립트 → 토큰 paste.

function fmt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function Inner() {
  const sp = useSearchParams();
  const ok = sp.get('ok');
  const err = sp.get('err');
  const detail = sp.get('detail');

  const [status, setStatus] = useState(null);
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [test, setTest] = useState(null);
  const [testing, setTesting] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => { setOrigin(window.location.origin); }, []);

  const refreshStatus = () => fetch('/api/spotify/token-status', { cache: 'no-store' })
    .then(r => r.json()).then(setStatus).catch(e => setStatus({ error: String(e) }));

  useEffect(() => { refreshStatus(); }, [ok]);

  const isHttps = origin.startsWith('https://');
  const callbackUri = origin ? `${origin}/api/spotify/oauth-callback` : '';

  const save = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      const r = await fetch('/api/spotify/token-paste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: token.trim() }),
      });
      const data = await r.json();
      if (r.ok && data.ok) {
        setSaveResult({ ok: true, rotated: data.rotated });
        setToken('');
        refreshStatus();
      } else {
        setSaveResult({ error: data.error || `HTTP ${r.status}`, detail: data.detail });
      }
    } catch (e) {
      setSaveResult({ error: 'network_error', detail: String(e?.message || e) });
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const r = await fetch('/api/spotify/now-playing', { cache: 'no-store' });
      const body = await r.text();
      setTest({ status: r.status, body: body.slice(0, 400) });
    } catch (e) {
      setTest({ status: 0, body: String(e?.message || e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <main className="min-h-[calc(100dvh-115px)] bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-6 flex flex-col gap-4">
        <h1 className="text-lg font-bold text-zinc-200">Spotify 재인증</h1>

        {ok && (
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
            ✅ 재인증 완료 — 새 refresh_token 이 DB 에 저장되었습니다.
          </div>
        )}
        {err && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            ❌ 실패: {err}{detail ? <div className="mt-1 text-[11px] text-red-400/80 break-all">{detail}</div> : null}
          </div>
        )}

        <section className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-4">
          <h2 className="text-sm font-bold text-zinc-300 mb-2">현재 토큰 상태</h2>
          {!status ? (
            <p className="text-xs text-zinc-500">불러오는 중…</p>
          ) : status.error ? (
            <p className="text-xs text-red-400">{status.error}</p>
          ) : (
            <div className="text-xs text-zinc-400 space-y-1 tabular-nums">
              <div>출처: <span className={status.stored?.storedInDB ? 'text-green-400' : 'text-amber-400'}>{status.stored?.storedInDB ? 'DB' : (status.stored?.envFallback ? '.env (fallback)' : '없음')}</span></div>
              {status.stored?.updatedAt && <div>갱신: {fmt(status.stored.updatedAt)}</div>}
              <div>access_token: {status.memory?.hasToken ? `유효 (${status.memory.secondsLeft}s 남음)` : '없음 (다음 호출 시 발급)'}</div>
            </div>
          )}
        </section>

        {/* 1클릭 OAuth — HTTPS 환경에서만 동작 */}
        {isHttps ? (
          <a
            href="/api/spotify/oauth-start"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-green-500/15 border border-green-500/30 hover:bg-green-500/25 active:bg-green-500/35 transition-colors text-green-300 text-sm font-bold px-4 py-3.5"
          >
            🎵  Spotify 재인증 (1클릭)
          </a>
        ) : (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 leading-relaxed">
            ⚠️ HTTP 접속 — 1클릭 OAuth 불가 (Spotify 가 비-HTTPS redirect 거부).
            <br /><span className="text-amber-300 font-semibold">https://43-202-133-239.sslip.io/dev/spotify-relogin</span> 으로 접속하면 1클릭 버튼 활성화.
          </div>
        )}

        <button
          type="button"
          onClick={runTest}
          disabled={testing}
          className="rounded-2xl bg-zinc-800/60 border border-white/[0.08] hover:bg-zinc-800/90 transition-colors text-zinc-300 text-sm font-semibold px-4 py-3 disabled:opacity-50"
        >
          {testing ? '테스트 중…' : '⚡ 동작 테스트 (now-playing)'}
        </button>
        {test && (
          <pre className={`text-[11px] rounded-xl border px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all ${test.status === 200 ? 'border-green-500/30 bg-green-500/10 text-green-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
{`HTTP ${test.status}\n${test.body}`}
          </pre>
        )}

        {/* paste fallback — 평소엔 접어둠 */}
        <button
          type="button"
          onClick={() => setPasteOpen(o => !o)}
          className="text-[11px] text-zinc-500 hover:text-zinc-300 text-left px-1"
        >
          {pasteOpen ? '▼' : '▶'} 수동 paste (HTTP 환경/OAuth 실패 시 fallback)
        </button>
        {pasteOpen && (
          <section className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-4 flex flex-col gap-3">
            <p className="text-[11px] text-zinc-500 leading-relaxed">PC 터미널: <code className="text-amber-300">SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... node scripts/spotify-bootstrap.mjs</code> → 출력의 <code className="text-amber-300">SPOTIFY_REFRESH_TOKEN=...</code> 값을 아래에 paste.</p>
            <textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="refresh_token (AQ... 로 시작)"
              spellCheck={false}
              rows={3}
              className="w-full bg-black/40 border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono break-all focus:outline-none focus:border-blue-500/50"
            />
            <button
              type="button"
              onClick={save}
              disabled={saving || !token.trim()}
              className="rounded-2xl bg-zinc-800 border border-white/[0.08] hover:bg-zinc-700 transition-colors text-zinc-200 text-sm font-semibold px-4 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? '검증·저장 중…' : '검증 후 저장'}
            </button>
            {saveResult?.ok && (
              <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-[12px] text-green-300">
                ✅ 저장 완료{saveResult.rotated ? ' (rotation)' : ''}
              </div>
            )}
            {saveResult?.error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
                ❌ {saveResult.error}{saveResult.detail && <div className="mt-1 text-[11px] text-red-400/80 break-all">{saveResult.detail}</div>}
              </div>
            )}
          </section>
        )}

        {isHttps && (
          <section className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-4 text-xs text-zinc-400 space-y-2">
            <h2 className="text-sm font-bold text-zinc-300">사전 준비 (1회)</h2>
            <p>Spotify Developer Dashboard → My Spotify Controller → Settings → Redirect URIs 에 다음 URL 추가:</p>
            <code className="block bg-black/40 border border-white/[0.06] rounded-lg px-3 py-2 text-amber-300 break-all">{callbackUri || '...'}</code>
            <p className="text-[11px] text-zinc-500">이미 등록되어 있으면 그대로 진행.</p>
          </section>
        )}
      </div>
    </main>
  );
}

export default function SpotifyReloginPage() {
  return (
    <Suspense fallback={<div className="p-4 text-zinc-500 text-sm">불러오는 중…</div>}>
      <Inner />
    </Suspense>
  );
}
