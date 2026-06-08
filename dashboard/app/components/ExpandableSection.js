'use client';

export default function ExpandableSection({ onExpand, isLoading, isLoaded, children, label = '자세히 보기' }) {
  if (isLoaded) return <div className="mt-3">{children}</div>;
  return (
    <div className="mt-3 border-t border-white/[0.06] pt-3">
      <button
        onClick={onExpand}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors py-1 disabled:opacity-50"
      >
        {isLoading ? (
          <span className="w-3 h-3 border border-zinc-500 border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
        {isLoading ? '로딩 중...' : label}
      </button>
    </div>
  );
}
