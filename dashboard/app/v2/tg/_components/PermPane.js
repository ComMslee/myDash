import { formatRelativeTime } from '@/lib/format';
import { Section } from './Section';
import { UserGroupsAdmin } from './UserGroupsAdmin';

export function PermPane({ pending, users, userGroups, categories, action, busy }) {
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
          <div className="text-[11px] text-zinc-500">#{p.chat_id} · {formatRelativeTime(p.registered_at)}</div>
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
