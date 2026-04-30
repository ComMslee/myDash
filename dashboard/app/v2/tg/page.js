'use client';

import { useEffect, useState } from 'react';

const fmtAgo = (iso) => {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return '미래?';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}초 전`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}분 전`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h 전`;
  return `${Math.floor(ms / 86_400_000)}일 전`;
};

export default function TgAdminPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const r = await fetch('/api/tg', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setData(j);
      setErr(null);
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  async function action(payload) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/tg/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'failed');
      await load();
    } catch (e) {
      alert(`실패: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (err && !data) {
    return (
      <main className="min-h-screen bg-[#0f0f0f] text-white p-4">
        <div className="text-rose-300">로딩 실패 — {err}</div>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="min-h-screen bg-[#0f0f0f] text-white p-4">
        <div className="text-zinc-500">로딩 중…</div>
      </main>
    );
  }

  const { hubHealth, users, pending, unmatched, categories } = data;
  const hubOk = hubHealth?.ok;

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 py-5 pb-12 flex flex-col gap-4">
        <h1 className="text-xl font-light">🤖 Telegram 봇 관리</h1>

        {/* Hub 상태 */}
        <section className="bg-[#161618] border border-white/[0.06] rounded-2xl p-4">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${hubOk ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            <span className="font-medium">{hubOk ? '정상' : '응답 없음'}</span>
            {hubOk && (
              <span className="text-[11px] text-zinc-500 ml-2">
                uptime {Math.floor((hubHealth.uptime_sec || 0) / 60)}분
              </span>
            )}
          </div>
          {!hubOk && hubHealth?.error && (
            <div className="text-[11px] text-rose-400 mt-1">{hubHealth.error}</div>
          )}
        </section>

        {/* 가입 대기 */}
        <Section title={`📋 가입 대기 ${pending.length ? `(${pending.length})` : ''}`}>
          {!pending.length ? (
            <div className="text-[12px] text-zinc-500">대기자 없음</div>
          ) : (
            <div className="flex flex-col gap-2">
              {pending.map((p) => (
                <div key={p.chat_id} className="flex items-center justify-between gap-2 bg-white/[0.02] rounded-lg p-2.5">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium truncate">{p.name || '(이름 없음)'}</div>
                    <div className="text-[11px] text-zinc-500">#{p.chat_id} · {fmtAgo(p.registered_at)}</div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      disabled={busy}
                      onClick={() => action({ action: 'approve', chat_id: p.chat_id })}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 text-[12px] hover:bg-emerald-500/25 disabled:opacity-50"
                    >
                      승인
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => confirm(`#${p.chat_id} 거부할까요?`) && action({ action: 'deny', chat_id: p.chat_id })}
                      className="px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-300 text-[12px] hover:bg-rose-500/25 disabled:opacity-50"
                    >
                      거부
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* 사용자 매트릭스 */}
        <Section title={`👥 사용자 (${users.length})`}>
          {!users.length ? (
            <div className="text-[12px] text-zinc-500">없음</div>
          ) : (
            <div className="flex flex-col gap-2">
              {users.map((u) => (
                <div key={u.chat_id} className="bg-white/[0.02] rounded-lg p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium truncate">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-white/[0.05] text-[10px] mr-1.5 align-middle">
                          {u.role}
                        </span>
                        {u.name || '(이름 없음)'}
                      </div>
                      <div className="text-[11px] text-zinc-500">#{u.chat_id}</div>
                    </div>
                    {u.role === 'user' && (
                      <button
                        disabled={busy}
                        onClick={() => confirm(`#${u.chat_id} 차단할까요?`) && action({ action: 'deny', chat_id: u.chat_id })}
                        className="px-2 py-1 rounded bg-rose-500/10 text-rose-300/80 text-[11px] hover:bg-rose-500/20 shrink-0"
                      >
                        차단
                      </button>
                    )}
                    {u.role === 'denied' && (
                      <button
                        disabled={busy}
                        onClick={() => action({ action: 'approve', chat_id: u.chat_id })}
                        className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-300/80 text-[11px] hover:bg-emerald-500/20 shrink-0"
                      >
                        해제
                      </button>
                    )}
                  </div>
                  {(u.role === 'user' || u.role === 'root') && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {categories.map((c) => {
                        const has = u.role === 'root' || u.features.includes(c.key);
                        const isRoot = u.role === 'root';
                        return (
                          <button
                            key={c.key}
                            disabled={busy || isRoot}
                            onClick={() => action({
                              action: has ? 'revoke' : 'grant',
                              chat_id: u.chat_id,
                              feature: c.key,
                            })}
                            className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${
                              has
                                ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'
                                : 'bg-white/[0.04] text-zinc-500 hover:bg-white/[0.08]'
                            } ${isRoot ? 'cursor-default' : ''}`}
                            title={c.desc}
                          >
                            {has ? '✓' : '+'} {c.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* 미인식 입력 (학습 로그) */}
        <Section title={`🔍 못 알아들은 입력 ${unmatched.length ? `(${unmatched.length})` : ''}`}>
          {!unmatched.length ? (
            <div className="text-[12px] text-zinc-500">없음 ✨</div>
          ) : (
            <UnmatchedList items={unmatched} action={action} busy={busy} />
          )}
        </Section>

        {/* Broadcast */}
        <Section title="📢 알림 보내기">
          <Broadcast categories={categories} action={action} busy={busy} />
        </Section>

        {/* 사용법 가이드 (사용자 입장) */}
        <Section title="📖 봇 사용법 (사용자에게 안내)">
          <div className="text-[12px] text-zinc-300 space-y-3 leading-relaxed">
            <div>
              <div className="font-medium mb-1">시작하는 방법</div>
              <div className="text-zinc-400">
                Telegram 앱에서 <code className="text-blue-300">@liam_mydash_bot</code> 검색 → "Start" 누르기 → 관리자 승인 대기 → 승인되면 사용 가능
              </div>
            </div>
            <div>
              <div className="font-medium mb-1">주요 명령</div>
              <ul className="text-zinc-400 list-disc list-inside space-y-0.5">
                <li><code className="text-blue-300">/soc</code> — 배터리 % + 충전 여부</li>
                <li><code className="text-blue-300">/today</code> — 오늘 주행/충전 요약</li>
                <li><code className="text-blue-300">/where</code> — 차량 현재 위치</li>
                <li><code className="text-blue-300">/help</code> — 전체 명령 보기</li>
                <li><code className="text-blue-300">/whoami</code> — 내 권한 확인</li>
              </ul>
            </div>
            <div>
              <div className="font-medium mb-1">자연어도 일부 가능</div>
              <ul className="text-zinc-400 list-disc list-inside space-y-0.5">
                <li>"오늘 얼마나 달렸어?"</li>
                <li>"배터리 얼마나 남았어?"</li>
                <li>"지금 어디?"</li>
              </ul>
            </div>
          </div>
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }) {
  return (
    <section className="bg-[#161618] border border-white/[0.06] rounded-2xl p-4">
      <h2 className="text-[12px] font-bold tracking-widest uppercase text-zinc-500 mb-3">{title}</h2>
      {children}
    </section>
  );
}

function UnmatchedList({ items, action, busy }) {
  const [selected, setSelected] = useState(new Set());

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const resolveSelected = async () => {
    if (!selected.size) return;
    await action({ action: 'resolve', ids: Array.from(selected) });
    setSelected(new Set());
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-zinc-500">{selected.size > 0 ? `${selected.size}건 선택` : '체크해서 일괄 해결'}</span>
        <button
          disabled={busy || !selected.size}
          onClick={resolveSelected}
          className="px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-300 text-[11px] hover:bg-blue-500/25 disabled:opacity-30"
        >
          선택 해결
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {items.map((u) => (
          <label
            key={u.id}
            className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-[12px] ${
              selected.has(u.id) ? 'bg-blue-500/10' : 'bg-white/[0.02] hover:bg-white/[0.04]'
            }`}
          >
            <input
              type="checkbox"
              checked={selected.has(u.id)}
              onChange={() => toggle(u.id)}
              className="accent-blue-500"
            />
            <span className="text-zinc-200 flex-1 truncate">{u.text}</span>
            <span className="text-[10px] text-zinc-600 shrink-0">#{u.chat_id} · {fmtAgo(u.ts)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function Broadcast({ categories, action, busy }) {
  const [text, setText] = useState('');
  const [target, setTarget] = useState('all');

  const send = async () => {
    if (!text.trim()) return;
    if (!confirm(`"${text}"\n\n→ ${target === 'all' ? '전체' : target} 에게 전송할까요?`)) return;
    await action({ action: 'broadcast', text: text.trim(), target });
    setText('');
  };

  return (
    <div className="flex flex-col gap-2">
      <select
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-[13px]"
      >
        <option value="all">전체 (root + user)</option>
        {categories.map((c) => (
          <option key={c.key} value={c.key}>{c.label} 권한자만</option>
        ))}
      </select>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="보낼 메시지"
        rows={3}
        className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-[13px] resize-y"
      />
      <button
        disabled={busy || !text.trim()}
        onClick={send}
        className="px-4 py-2 rounded-lg bg-blue-500/20 text-blue-200 text-[13px] hover:bg-blue-500/30 disabled:opacity-30 self-end"
      >
        보내기
      </button>
    </div>
  );
}
