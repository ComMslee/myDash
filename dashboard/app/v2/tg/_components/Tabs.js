const TAB_LIST = [
  { key: 'perm', label: '권한관리' },
  { key: 'broadcast', label: '알림' },
  { key: 'guide', label: '가이드' },
];

export function Tabs({ tab, onChange }) {
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
