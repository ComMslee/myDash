'use client';

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-7 h-7 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
    </div>
  );
}
