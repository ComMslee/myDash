'use client';

// 현재 활성 디바이스 표시. 차량(isVehicle) 이면 초록 강조.
export default function DeviceBadge({ device }) {
  if (!device) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-white/[0.04] text-zinc-500">
        디바이스 없음
      </span>
    );
  }

  const icon = device.isVehicle ? '🚗'
             : device.type === 'Smartphone' ? '📱'
             : device.type === 'Computer' ? '💻'
             : device.type === 'Speaker' ? '🔊'
             : '🎵';

  const cls = device.isVehicle
    ? 'bg-green-500/15 text-green-300 ring-1 ring-green-500/30'
    : 'bg-white/[0.04] text-zinc-400';

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] ${cls}`}>
      <span>{icon}</span>
      <span className="truncate max-w-[140px]" title={device.name}>{device.name}</span>
    </span>
  );
}
