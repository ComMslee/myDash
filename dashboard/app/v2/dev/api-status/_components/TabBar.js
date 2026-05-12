'use client';

import { Icon } from '@/app/lib/Icons';

const TABS = [
  { id: 'server', label: '서버' },
  { id: 'api',    label: 'API 테스트' },
  { id: 'agg',    label: '집계' },
];

export function TabBar({ tab, onChange, serverErr, counts }) {
  return (
    <div className="flex gap-1 bg-[#161618] border border-white/[0.06] rounded-2xl p-1">
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`flex-1 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors ${
            tab === id ? 'bg-white/[0.06] text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {label}
          {id === 'server' && serverErr && (
            <Icon name="warn" className="w-4 h-4 inline-block align-middle ml-1.5 text-rose-400" />
          )}
          {id === 'api' && counts?.fail > 0 && (
            <span className="ml-1.5 text-rose-400 text-[11px] tabular-nums inline-flex items-center gap-0.5">
              <Icon name="x" className="w-4 h-4" />{counts.fail}
            </span>
          )}
          {id === 'api' && counts?.fail === 0 && counts?.slow > 0 && (
            <span className="ml-1.5 text-amber-400 text-[11px] tabular-nums inline-flex items-center gap-0.5">
              <Icon name="warn" className="w-4 h-4" />{counts.slow}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
