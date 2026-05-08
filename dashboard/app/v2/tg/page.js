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

      <Section title="🧪 알림 포맷 테스트 (root 한정)">
        <TestNotify action={action} busy={busy} />
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

const TEST_KINDS = [
  { key: 'charge_start',         label: '⚡ 충전 시작' },
  { key: 'charge_end_slow_full', label: '✅ 충전 완료 (집·완속·풀)' },
  { key: 'charge_end_fast_quick',label: '✅ 충전 완료 (외부·급속)' },
  { key: 'charge_end_topup',     label: '✅ 충전 완료 (짧은 보충)' },
  { key: 'charge_end_zero',      label: '✅ 충전 완료 (0kWh 취소성)' },
  { key: 'drive_end',            label: '🚗 주행 종료 (단거리)' },
  { key: 'drive_end_long',       label: '🚗 주행 종료 (장거리)' },
  { key: 'weekdays_digest',      label: '📅 주간 요약 (토 09:00, 월~금)' },
  { key: 'weekend_digest',       label: '📅 주말 요약 (월 09:00, 토·일)' },
];

function TestNotify({ action, busy }) {
  return (
    <div>
      <p className="text-[11px] text-zinc-500 mb-3">
        본인(root) 텔레그램으로 샘플 메시지 발송. 가족엔 가지 않음.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {TEST_KINDS.map((t) => (
          <button
            key={t.key}
            disabled={busy}
            onClick={() => action({ action: 'test_notify', kind: t.key })}
            className="text-left px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[12px] text-zinc-200 hover:bg-white/[0.08] disabled:opacity-30"
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
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
    <div className="text-[12px] text-zinc-300 space-y-4 leading-relaxed">
      <div>
        <div className="font-medium mb-1">1. 시작하는 방법</div>
        <div className="text-zinc-400">
          Telegram 앱에서 <code className="text-blue-300">@liam_mydash_bot</code> 검색 → "Start" 누르기 → 관리자 승인 대기 → 승인되면 사용 가능 (`/help` 자동 표시).
        </div>
      </div>

      <div>
        <div className="font-medium mb-1">2. 메뉴 사용법 — 슬래시 외울 필요 없음</div>
        <div className="text-zinc-400 mb-1">
          채팅창 하단에 한글 키보드가 자동으로 깔립니다. 누르면 슬래시 명령으로 변환되어 전송.
        </div>
        <div className="bg-black/30 rounded p-2 text-[11px] text-zinc-300 font-mono leading-relaxed">
          {`[🚗 차량]  [🏠 가족]  [📝 SNS]      ← 메인
        ↓ 카테고리 누르면
[🔋 배터리]  [🛣 주행거리]  [📍 위치]
[📊 요약]    [🔌 충전기]    [🗺 가는 곳]
[⬅️ 메인]                                ← 메인 복귀`}
        </div>
        <div className="text-zinc-500 text-[11px] mt-1">
          텔레그램 입력창 좌측 [/] 메뉴는 <b>비활성</b> — 본 봇은 Reply 키보드만 사용.
        </div>
      </div>

      <div>
        <div className="font-medium mb-1">3. 차량 명령 (car 권한)</div>
        <ul className="text-zinc-400 list-disc list-inside space-y-0.5">
          <li><b>🔋 배터리</b> <code className="text-blue-300">/soc</code> — % + 거리 + 충전 상세 통합</li>
          <li><b>🛣 주행거리</b> <code className="text-blue-300">/range</code> — 남은 거리 (alias)</li>
          <li><b>📊 요약</b> <code className="text-blue-300">/period</code> — 오늘·이번주·저번주·최근4주·직전4주 (km · 전비)</li>
          <li><b>📍 위치</b> <code className="text-blue-300">/where</code> — 정차/주행 통합 (지도 핀 포함)</li>
          <li><b>🔌 충전기</b> <code className="text-blue-300">/chargers</code> — 즐겨찾기 동별 가용/충전중</li>
          <li><b>🗺 가는 곳</b> <code className="text-blue-300">/places</code> — 자주가는 곳 / 오래머문 곳 TOP 10 (분기)</li>
        </ul>
        <div className="text-zinc-500 text-[11px] mt-1">
          이전 명령은 alias 로 살아있음: /charge → /soc, /yesterday /week → /period, /parked → /where.
        </div>
      </div>

      <div>
        <div className="font-medium mb-1">4. 가족 명령 (family 권한 · mock)</div>
        <ul className="text-zinc-400 list-disc list-inside space-y-0.5">
          <li><b>🌤 오늘 날씨</b> <code className="text-blue-300">/weather</code> — 기상청 단기예보 (예정)</li>
          <li><b>🌧 강수 예보</b> <code className="text-blue-300">/forecast</code> — 비/눈 사전 알림 (예정)</li>
          <li><b>📅 일정</b> <code className="text-blue-300">/event</code> — 등록·조회·반복 + 알림 (예정)</li>
          <li><b>📝 메모</b> <code className="text-blue-300">/memo</code> — 가족 공유 메모 (예정)</li>
        </ul>
        <div className="text-zinc-500 text-[11px] mt-1">
          현재는 placeholder 응답. 실제 구현은 후속 PR.
        </div>
      </div>

      <div>
        <div className="font-medium mb-1">5. SNS 명령 (sns 권한 · mock)</div>
        <ul className="text-zinc-400 list-disc list-inside space-y-0.5">
          <li><b>📝 글쓰기</b> <code className="text-blue-300">/post</code> — 네이버 블로그 (mock 채널 검증)</li>
        </ul>
        <div className="text-zinc-400 mt-1 text-[11px]">
          누르면 "본문/사진 보내주세요" 안내 → 텍스트/사진/사진+캡션 입력 → 미리보기 표시 → [✅ 발행] 누르면 dashboard 로 전달 확인. 5분 안에 입력 안 하면 자동 취소.
        </div>
      </div>

      <div>
        <div className="font-medium mb-1">6. 🔔 자동 알림 — 이벤트 push</div>
        <div className="text-zinc-400 text-[11px] space-y-1">
          <div>각 알림은 해당 <b>기능그룹 권한자 전원</b>에 자동 발송. 그룹 권한 없으면 받지 않음.</div>
          <div className="font-semibold text-zinc-300 mt-1">🚗 car 그룹 (차량 이벤트, poller 5초 폴링)</div>
          <ul className="list-disc list-inside space-y-0.5 ml-1">
            <li><b>⚡ 충전 시작</b> — SOC + 위치</li>
            <li><b>✅ 충전 완료</b> — SOC델타·kWh·환산km / ⚡급속·🔌완속 / ⏱️시간·📈평균kW · 위치</li>
            <li><b>🚗 주행 종료</b> — 시작→끝 / km · 시간 / Wh/km · km/kWh</li>
            <li><b>📅 주간 요약 (월~금)</b> — 매주 <b>토 09:00 KST</b></li>
            <li><b>📅 주말 요약 (토·일)</b> — 매주 <b>월 09:00 KST</b></li>
          </ul>
          <div className="font-semibold text-zinc-300 mt-2">🏠 family 그룹</div>
          <ul className="list-disc list-inside space-y-0.5 ml-1 text-zinc-500">
            <li>비/눈 1~2시간 전 자동 broadcast (예정)</li>
            <li>등록 일정 알림 (예정)</li>
          </ul>
          <div className="font-semibold text-zinc-300 mt-2">📝 sns 그룹</div>
          <ul className="list-disc list-inside space-y-0.5 ml-1 text-zinc-500">
            <li>발행 결과 통보 (mock)</li>
          </ul>
          <div className="mt-1">
            <b>야간 매너모드</b>: 23~06시 KST 알림은 <code className="text-blue-300">disable_notification</code> 자동 적용 — 메시지는 도착하지만 소리/진동 OFF.
          </div>
          <div>
            <b>인라인 버튼</b> (env <code className="text-blue-300">DASHBOARD_PUBLIC_URL</code> 설정 시): 주행 종료 → 🗺️ 지도 보기, 충전 완료 → 🔋 배터리 상세.
          </div>
          <div className="text-zinc-500">
            "알림" 탭의 <b>🧪 알림 포맷 테스트</b> 에서 10종 샘플 발송 가능 (root 한정).
          </div>
        </div>
      </div>

      <div>
        <div className="font-medium mb-1">7. 응답 후속 액션</div>
        <div className="text-zinc-400 text-[11px]">
          데이터 명령 응답 끝에 inline 버튼 자동 동봉:
          <span className="ml-1 px-1.5 py-0.5 bg-zinc-800 rounded">🔄</span> (새로고침),
          <span className="ml-1 px-1.5 py-0.5 bg-zinc-800 rounded">🛣 거리</span>,
          <span className="ml-1 px-1.5 py-0.5 bg-zinc-800 rounded">🔌 충전기</span> 등 — 컨텍스트 기반 인접 명령.
        </div>
      </div>

      <div>
        <div className="font-medium mb-1">8. 공통 명령 (누구나)</div>
        <ul className="text-zinc-400 list-disc list-inside space-y-0.5">
          <li><code className="text-blue-300">/help</code> — 본인 권한 기준 도움말 + Reply 키보드</li>
          <li><code className="text-blue-300">/whoami</code> — 이름·역할·권한 (root 만 chat_id)</li>
          <li><code className="text-blue-300">/categories</code> — 보유 카테고리 목록</li>
        </ul>
      </div>

      <div>
        <div className="font-medium mb-1">9. 자연어 — 미지원</div>
        <div className="text-zinc-400 text-[11px]">
          정규식 기반 자연어 매칭은 정확도 부족으로 제거. 슬래시 명령 또는 키보드 버튼만 동작.
          잘못된 입력은 친근한 안내로 폴백 + 학습 로그(<code className="text-blue-300">hub_unmatched_inputs</code>) 적재.
        </div>
      </div>

      <div>
        <div className="font-medium mb-1">10. 활용도 리포트 (대시보드)</div>
        <div className="text-zinc-400 text-[11px]">
          <code className="text-blue-300">/v2/chargers</code> 하단의 라이브 패널 — 단지 충전기 활용도 한 화면 요약 (외부 근거자료용). KPI · 주별 추이 · 동별 가동률.
        </div>
      </div>

      <div className="text-[11px] text-zinc-500 border-t border-white/[0.04] pt-2">
        권한 없는 명령은 "이 기능은 아직 권한이 없어요" 안내. 관리자 명령(/pending /setgroup /deny)은 root 만 보임.
      </div>
    </div>
  );
}
