export function Section({ title, children }) {
  return (
    <section className="bg-[#161618] border border-white/[0.06] rounded-2xl p-4">
      <h2 className="text-[12px] font-bold tracking-widest uppercase text-zinc-500 mb-3">{title}</h2>
      {children}
    </section>
  );
}
