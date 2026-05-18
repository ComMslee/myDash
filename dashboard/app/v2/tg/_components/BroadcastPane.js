import { useState } from 'react';
import { formatRelativeTime } from '@/lib/format';
import { Section } from './Section';

export function BroadcastPane({ userGroups, unmatched, action, busy }) {
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
            <span className="text-[10px] text-zinc-600 shrink-0">#{u.chat_id} · {formatRelativeTime(u.ts)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
