// 미니 스파크라인 — 30 샘플 × 30초 = 최근 15분 트렌드
export function Sparkline({ values, color = '#52525b', width = 44, height = 12 }) {
  const valid = values?.filter(v => v != null) || [];
  if (valid.length < 2) return null;
  const lo = Math.min(...valid);
  const hi = Math.max(...valid);
  const range = hi - lo || 1;
  const stepX = width / Math.max(1, values.length - 1);
  const pts = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    const x = i * stepX;
    const y = height - ((v - lo) / range) * height;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return (
    <svg width={width} height={height} className="inline-block ml-1.5 align-middle opacity-80" aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
