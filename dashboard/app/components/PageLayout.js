'use client';

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-7 h-7 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
    </div>
  );
}

export function SectionLabel({ title }) {
  return (
    <div className="flex items-center px-0.5 mb-3">
      <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-600">{title}</span>
    </div>
  );
}

export function Card({ children, className = '' }) {
  return (
    <div className={`bg-[#161618] border border-white/[0.06] rounded-2xl shadow-lg ${className}`}>
      {children}
    </div>
  );
}
