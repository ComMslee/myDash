export function ChargingDiagPanel({ data }) {
  const dbg = data.debug || {};
  const Cell = ({ label, value, valueClass = 'text-zinc-200' }) => (
    <div className="flex items-baseline gap-1">
      <span className="text-zinc-600">{label}=</span>
      <span className={`${valueClass} font-mono`}>{value}</span>
    </div>
  );
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] tabular-nums">
      <Cell label="charging" value={String(!!data.charging)}
            valueClass={data.charging ? 'text-emerald-400' : 'text-zinc-400'} />
      {data.fallback && <Cell label="fb" value={data.fallback_reason || 'true'} valueClass="text-amber-400" />}
      <Cell label="pwr" value={dbg.latest_power ?? 'null'} />
      <Cell label="lvl" value={`${dbg.recent_level ?? 'null'}→${dbg.older_level ?? 'null'}`} />
      <Cell label="pSig" value={String(dbg.power_signal)}
            valueClass={dbg.power_signal ? 'text-emerald-400' : 'text-zinc-400'} />
      <Cell label="lSig" value={String(dbg.level_signal)}
            valueClass={dbg.level_signal ? 'text-emerald-400' : 'text-zinc-400'} />
      {data.battery_level != null && <Cell label="soc" value={`${data.battery_level}%`} />}
      {data.charge_power != null && <Cell label="kW" value={data.charge_power} />}
    </div>
  );
}
