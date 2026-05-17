export function HubStatus({ health }) {
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
