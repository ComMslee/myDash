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

export default function TgPage() {
  const [data, setData] = useState(null);
  const [view, setView] = useState('loading'); // 'loading' | 'admin' | 'public'
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('perm');

  async function load() {
    try {
      const r = await fetch('/api/tg', { cache: 'no-store' });
      if (r.status === 401 || r.status === 412) {
        setView('public');
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setData(j);
      setView('admin');
      setErr(null);
    } catch (e) {
      setErr(e.message || String(e));
      setView('admin');
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

  if (view === 'loading') {
    return (
      <main className="min-h-screen bg-[#0f0f0f] text-white p-4">
        <div className="text-zinc-500">로딩 중…</div>
      </main>
    );
  }

  if (view === 'public') {
    return (
      <main className="min-h-screen bg-[#0f0f0f] text-white">
        <div className="max-w-2xl mx-auto px-4 py-5 pb-12 flex flex-col gap-4">
          <h1 className="text-xl font-light">📖 봇 가이드</h1>
          <Section title="📖 사용법">
            <GuidePane />
          </Section>
        </div>
      </main>
    );
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

  const { hubHealth, users, pending, unmatched, categories, userGroups } = data;

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 py-5 pb-12 flex flex-col gap-4">
        <h1 className="text-xl font-light">🤖 Telegram 봇 관리</h1>

        <HubStatus health={hubHealth} />

        <Tabs tab={tab} onChange={setTab} />

        {tab === 'perm' && (
          <PermPane
            pending={pending}
            users={users}
            userGroups={userGroups}
            categories={categories}
            action={action}
            busy={busy}
          />
        )}
        {tab === 'broadcast' && (
          <BroadcastPane
            userGroups={userGroups}
            unmatched={unmatched}
            action={action}
            busy={busy}
          />
        )}
        {tab === 'guide' && (
          <Section title="📖 사용법">
            <GuidePane />
          </Section>
        )}
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <section className="bg-[#161618] border border-white/[0.06] rounded-2xl p-4">
      <h2 className="text-[12px] font-bold tracking-widest uppercase text-zinc-500 mb-3">{title}</h2>
      {children}
    </section>
  );
}

function HubStatus({ health }) {
  const ok = health?.ok;
  return (
    <section className="bg-[#161618] border border-white/[0.06] rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-rose-400'}`} />
        <span className="font-medium">{ok ? '정상' : '응답 없음'}</span>
        {ok && (
          <span className="text-[11px] text-zinc-500 ml-2">
            uptime {Math.floor((health.uptime_sec || 0) / 60)}분
          </span>
        )}
      </div>
      {!ok && health?.error && (
        <div className="text-[11px] text-rose-400 mt-1">{health.error}</div>
      )}
    </section>
  );
}

const TAB_LIST = [
  { key: 'perm', label: '권한관리' },
  { key: 'broadcast', label: '알림' },
  { key: 'guide', label: '가이드' },
];

function Tabs({ tab, onChange }) {
  return (
    <div className="flex gap-1 bg-[#161618] border border-white/[0.06] rounded-xl p-1">
      {TAB_LIST.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`flex-1 px-3 py-2 rounded-lg text-[12px] font-medium transition-colors ${
            tab === t.key
              ? 'bg-white/[0.08] text-white'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── 권한관리 탭 ────────────────────────────────────────────

function PermPane({ pending, users, userGroups, categories, action, busy }) {
  return (
    <>
      <Section title={`📋 가입 대기 ${pending.length ? `(${pending.length})` : ''}`}>
        {!pending.length ? (
          <div className="text-[12px] text-zinc-500">대기자 없음</div>
        ) : (
          <div className="flex flex-col gap-2">
            {pending.map((p) => (
              <PendingRow
                key={p.chat_id}
                p={p}
                userGroups={userGroups}
                busy={busy}
                action={action}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title={`👥 사용자 그룹 (${userGroups.length})`}>
        <UserGroupsAdmin
          userGroups={userGroups}
          categories={categories}
          action={action}
          busy={busy}
        />
      </Section>

      <Section title={`👤 사용자 (${users.length})`}>
        <UsersTable users={users} userGroups={userGroups} busy={busy} action={action} />
      </Section>
    </>
  );
}

function PendingRow({ p, userGroups, busy, action }) {
  return (
    <div className="bg-white/[0.02] rounded-lg p-2.5 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-medium truncate">{p.name || '(이름 없음)'}</div>
          <div className="text-[11px] text-zinc-500">#{p.chat_id} · {fmtAgo(p.registered_at)}</div>
        </div>
        <button
          disabled={busy}
          onClick={() => confirm(`#${p.chat_id} 거부할까요?`) && action({ action: 'deny', chat_id: p.chat_id })}
          className="px-2.5 py-1 rounded bg-rose-500/15 text-rose-300 text-[11px] hover:bg-rose-500/25 disabled:opacity-50 shrink-0"
        >
          거부
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {userGroups.map((g) => (
          <button
            key={g.key}
            disabled={busy}
            onClick={() => action({ action: 'usergroup_apply', chat_id: p.chat_id, group_key: g.key })}
            className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-[11px] hover:bg-emerald-500/25 disabled:opacity-50"
            title={g.desc}
          >
            → {g.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function UsersTable({ users, userGroups, busy, action }) {
  if (!users.length) return <div className="text-[12px] text-zinc-500">없음</div>;
  return (
    <div className="-mx-1">
      <div className="grid grid-cols-[100px_1fr_auto_auto] gap-2 items-center text-[10px] uppercase tracking-wider text-zinc-500 px-2 pb-1.5 border-b border-white/[0.05]">
        <span>ID</span>
        <span>이름</span>
        <span>현재</span>
        <span>변경</span>
      </div>
      <div className="flex flex-col">
        {users.map((u) => (
          <UserRow
            key={u.chat_id}
            u={u}
            userGroups={userGroups}
            busy={busy}
            action={action}
          />
        ))}
      </div>
    </div>
  );
}

function UserRow({ u, userGroups, busy, action }) {
  const currentGroup = userGroups.find((g) => g.key === u.group_key);
  const isRoot = u.role === 'root';
  const isDenied = u.role === 'denied';

  const onPickGroup = (v) => {
    if (!v) return;
    if (v === u.group_key && !isDenied) return;
    const label = userGroups.find((g) => g.key === v)?.label || v;
    if (!confirm(`#${u.chat_id} → '${label}' 적용할까요?`)) return;
    action({ action: 'usergroup_apply', chat_id: u.chat_id, group_key: v });
  };

  return (
    <div className="grid grid-cols-[100px_1fr_auto_auto] gap-2 items-center px-2 py-2 border-b border-white/[0.03] hover:bg-white/[0.02]">
      <span className="text-[10px] font-mono text-zinc-500 truncate" title={u.chat_id}>
        #{u.chat_id}
      </span>
      <span className="text-[12px] truncate">
        {u.name || <span className="text-zinc-600">—</span>}
      </span>
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${
          isDenied
            ? 'bg-rose-500/15 text-rose-300'
            : isRoot
              ? 'bg-purple-500/15 text-purple-300'
              : currentGroup
                ? 'bg-blue-500/15 text-blue-300'
                : 'bg-white/[0.05] text-zinc-400'
        }`}
      >
        {isDenied ? '차단됨' : (currentGroup?.label || u.role)}
      </span>
      <div className="flex items-center gap-1">
        <select
          value=""
          disabled={busy}
          onChange={(e) => { onPickGroup(e.target.value); e.target.value = ''; }}
          className="bg-white/[0.04] border border-white/[0.06] rounded px-1.5 py-1 text-[11px] max-w-[110px]"
        >
          <option value="">{isDenied ? '재활성…' : '그룹…'}</option>
          {userGroups.map((g) => (
            <option key={g.key} value={g.key} disabled={g.key === u.group_key && !isDenied}>
              → {g.label}
            </option>
          ))}
        </select>
        {!isRoot && !isDenied && (
          <button
            disabled={busy}
            onClick={() => confirm(`#${u.chat_id} 차단할까요?`) && action({ action: 'deny', chat_id: u.chat_id })}
            className="px-1.5 py-1 rounded bg-rose-500/10 text-rose-300/80 text-[10px] hover:bg-rose-500/20"
            title="차단"
          >
            차단
          </button>
        )}
      </div>
    </div>
  );
}

function UserGroupsAdmin({ userGroups, categories, action, busy }) {
  const [adding, setAdding] = useState(false);
  const [editKey, setEditKey] = useState(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] text-zinc-500 leading-relaxed">
        사용자 그룹은 권한 프리셋. 기본 그룹(<b>root</b>/<b>guest</b>)은 편집/삭제 불가.
      </div>

      {!userGroups.length ? (
        <div className="text-[12px] text-zinc-500">그룹 없음</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {userGroups.map((g) =>
            editKey === g.key ? (
              <UserGroupEditRow
                key={g.key}
                group={g}
                categories={categories}
                busy={busy}
                onCancel={() => setEditKey(null)}
                onSave={async (patch) => {
                  await action({ action: 'usergroup_update', key: g.key, ...patch });
                  setEditKey(null);
                }}
              />
            ) : (
              <UserGroupRow
                key={g.key}
                g={g}
                busy={busy}
                onEdit={() => setEditKey(g.key)}
                onDelete={() =>
                  confirm(`'${g.label}' 그룹을 삭제할까요?`) &&
                  action({ action: 'usergroup_delete', key: g.key })
                }
              />
            ),
          )}
        </div>
      )}

      {adding ? (
        <UserGroupEditRow
          isNew
          categories={categories}
          busy={busy}
          onCancel={() => setAdding(false)}
          onSave={async (patch) => {
            await action({ action: 'usergroup_create', ...patch });
            setAdding(false);
          }}
        />
      ) : (
        <button
          disabled={busy}
          onClick={() => setAdding(true)}
          className="self-start px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-300 text-[12px] hover:bg-blue-500/25 disabled:opacity-30"
        >
          + 새 그룹
        </button>
      )}
    </div>
  );
}

function UserGroupRow({ g, busy, onEdit, onDelete }) {
  return (
    <div className="bg-white/[0.02] rounded-lg p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium truncate flex items-center gap-1.5">
            {g.label}
            <span className="text-[10px] text-zinc-500">#{g.key}</span>
            {g.is_default && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">기본</span>
            )}
            {g.is_root && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300">root</span>
            )}
          </div>
          {g.desc && <div className="text-[11px] text-zinc-400">{g.desc}</div>}
          <div className="text-[10px] text-zinc-500 mt-1">
            기능: {g.is_root ? '* (전체)' : (g.features.length ? g.features.join(', ') : '없음')}
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            disabled={busy || g.is_default}
            onClick={onEdit}
            className="px-2 py-1 rounded bg-white/[0.05] text-zinc-300 text-[11px] hover:bg-white/[0.1] disabled:opacity-30"
            title={g.is_default ? '기본 그룹은 편집 불가' : ''}
          >
            편집
          </button>
          <button
            disabled={busy || g.is_default}
            onClick={onDelete}
            className="px-2 py-1 rounded bg-rose-500/10 text-rose-300/80 text-[11px] hover:bg-rose-500/20 disabled:opacity-30"
            title={g.is_default ? '기본 그룹은 삭제 불가' : ''}
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}

function UserGroupEditRow({ group, categories, isNew, busy, onSave, onCancel }) {
  const [key, setKey] = useState(group?.key || '');
  const [label, setLabel] = useState(group?.label || '');
  const [desc, setDesc] = useState(group?.desc || '');
  const [sort, setSort] = useState(group?.sort_order ?? 100);
  const [features, setFeatures] = useState(group?.features || []);

  const toggleFeature = (k) => {
    setFeatures((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    );
  };

  const submit = () => {
    if (!label.trim()) return alert('label 필수');
    if (isNew && !/^[a-z][a-z0-9_]{0,31}$/.test(key.trim())) {
      return alert('key: 영문 소문자/숫자/_ 1~32자 (첫 글자 영문)');
    }
    const patch = {
      label: label.trim(),
      desc: desc.trim(),
      sort_order: +sort,
      features,
    };
    if (isNew) patch.key = key.trim();
    onSave(patch);
  };

  return (
    <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-2.5 flex flex-col gap-1.5">
      {isNew && (
        <input
          value={key}
          onChange={(e) => setKey(e.target.value.toLowerCase())}
          placeholder="key (예: editor, family)"
          className="bg-white/[0.04] border border-white/[0.06] rounded px-2 py-1 text-[12px] font-mono"
          autoFocus
        />
      )}
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="label (예: 📝 편집자)"
        className="bg-white/[0.04] border border-white/[0.06] rounded px-2 py-1 text-[12px]"
        autoFocus={!isNew}
      />
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="설명 (선택)"
        className="bg-white/[0.04] border border-white/[0.06] rounded px-2 py-1 text-[12px]"
      />
      <div>
        <div className="text-[11px] text-zinc-500 mb-1">포함 기능 그룹</div>
        <div className="flex flex-wrap gap-1.5">
          {categories.length ? categories.map((c) => {
            const has = features.includes(c.key);
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => toggleFeature(c.key)}
                className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${
                  has
                    ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'
                    : 'bg-white/[0.04] text-zinc-500 hover:bg-white/[0.08]'
                }`}
              >
                {has ? '✓' : '+'} {c.label}
              </button>
            );
          }) : <span className="text-[11px] text-zinc-600">기능 그룹 없음</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[11px] text-zinc-500">정렬</label>
        <input
          type="number"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="bg-white/[0.04] border border-white/[0.06] rounded px-2 py-1 text-[12px] w-20"
        />
        <div className="flex-1" />
        <button
          disabled={busy}
          onClick={onCancel}
          className="px-2.5 py-1 rounded bg-white/[0.05] text-zinc-300 text-[11px] hover:bg-white/[0.1]"
        >
          취소
        </button>
        <button
          disabled={busy}
          onClick={submit}
          className="px-3 py-1 rounded bg-emerald-500/20 text-emerald-200 text-[11px] hover:bg-emerald-500/30 disabled:opacity-30"
        >
          {isNew ? '만들기' : '저장'}
        </button>
      </div>
    </div>
  );
}

// ── 알림 탭 ─────────────────────────────────────────────

function BroadcastPane({ userGroups, unmatched, action, busy }) {
  return (
    <>
      <Section title="📢 알림 보내기">
        <Broadcast userGroups={userGroups} action={action} busy={busy} />
      </Section>

      <Section title={`🔍 못 알아들은 입력 ${unmatched.length ? `(${unmatched.length})` : ''}`}>
        {!unmatched.length ? (
          <div className="text-[12px] text-zinc-500">없음 ✨</div>
        ) : (
          <UnmatchedList items={unmatched} action={action} busy={busy} />
        )}
      </Section>
    </>
  );
}

function Broadcast({ userGroups, action, busy }) {
  const [text, setText] = useState('');
  const [target, setTarget] = useState('all');

  const send = async () => {
    if (!text.trim()) return;
    const targetLabel = target === 'all'
      ? '전체'
      : userGroups.find((g) => g.key === target)?.label || target;
    if (!confirm(`"${text}"\n\n→ ${targetLabel} 에게 전송할까요?`)) return;
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
        {userGroups.map((g) => (
          <option key={g.key} value={g.key}>{g.label} 그룹</option>
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

// ── 가이드 탭 ───────────────────────────────────────────

function GuidePane() {
  return (
    <div className="text-[12px] text-zinc-300 space-y-3 leading-relaxed">
      <div>
        <div className="font-medium mb-1">시작하는 방법</div>
        <div className="text-zinc-400">
          Telegram 앱에서 <code className="text-blue-300">@liam_mydash_bot</code> 검색 → "Start" 누르기 → 관리자 승인 대기 → 승인되면 사용 가능
        </div>
      </div>
      <div>
        <div className="font-medium mb-1">차량 명령 (car 권한 필요)</div>
        <ul className="text-zinc-400 list-disc list-inside space-y-0.5">
          <li><code className="text-blue-300">/soc</code> — 배터리 % + 충전 여부</li>
          <li><code className="text-blue-300">/range</code> — 남은 주행거리 (km)</li>
          <li><code className="text-blue-300">/charge</code> — 충전 진행 상세 (속도·경과)</li>
          <li><code className="text-blue-300">/today</code> — 오늘(KST) 주행/충전 요약</li>
          <li><code className="text-blue-300">/yesterday</code> — 어제(KST) 주행/충전 요약</li>
          <li><code className="text-blue-300">/week</code> — 지난 7일 요약</li>
          <li><code className="text-blue-300">/parked</code> — 마지막 주차 장소·경과</li>
          <li><code className="text-blue-300">/where</code> — 현재 위치 (지도 핀)</li>
        </ul>
      </div>
      <div>
        <div className="font-medium mb-1">공통 명령 (누구나)</div>
        <ul className="text-zinc-400 list-disc list-inside space-y-0.5">
          <li><code className="text-blue-300">/help</code> — 본인 권한 기준 도움말</li>
          <li><code className="text-blue-300">/whoami</code> — 내 권한 확인</li>
          <li><code className="text-blue-300">/categories</code> — 이용 가능한 카테고리</li>
        </ul>
      </div>
      <div>
        <div className="font-medium mb-1">자연어도 일부 가능</div>
        <ul className="text-zinc-400 list-disc list-inside space-y-0.5">
          <li>"오늘 얼마나 달렸어?" / "이번 주는?" / "어제 충전했어?"</li>
          <li>"배터리 얼마나 남았어?" / "지금 몇 % 야?"</li>
          <li>"몇 km 갈 수 있어?" / "주행가능거리"</li>
          <li>"지금 충전 얼마나 됐어?" / "언제 끝나?"</li>
          <li>"지금 어디?" / "주차한 지 얼마나 됐어?"</li>
        </ul>
      </div>
      <div className="text-[11px] text-zinc-500">
        권한 없는 명령은 "알 수 없는 명령" 으로 표시 — 기능 존재 자체가 노출되지 않아요.
      </div>
    </div>
  );
}
