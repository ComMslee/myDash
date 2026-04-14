'use client';

export default function HealthScoreCard({ data }) {
  const { score, grade, avg_soc, optimal_center = 50, range_low = 20, range_high = 80, battery_type = 'NCA/NMC', total_readings, soc_histogram, zone_pct, tips } = data;

  if (total_readings === 0) {
    return (
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-6 text-center">
        <div className="text-zinc-600 text-sm">SOC 데이터가 아직 없습니다</div>
      </div>
    );
  }

  // Arc gauge config
  const SIZE = 150;
  const CX = SIZE / 2;
  const CY = SIZE / 2 + 6;
  const R = 60;
  const STROKE = 9;
  const START_DEG = 160;
  const ARC_TOTAL = 220;
  const progress = score / 100;

  function polarToXY(deg, r) {
    const rad = (deg * Math.PI) / 180;
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
  }
  function describeArc(startDeg, endDeg, r) {
    const start = polarToXY(startDeg, r);
    const end = polarToXY(endDeg, r);
    const largeArc = ((endDeg - startDeg + 360) % 360) > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  }

  const trackPath = describeArc(START_DEG, START_DEG + ARC_TOTAL, R);
  const progressPath = progress > 0
    ? describeArc(START_DEG, START_DEG + ARC_TOTAL * progress, R)
    : null;

  const arcColor = score >= 80 ? '#10b981' : score >= 60 ? '#3b82f6'
    : score >= 40 ? '#f59e0b' : '#ef4444';

  // SOC histogram
  const maxHist = Math.max(1, ...soc_histogram);
  const histH = 44;

  // Zone bar
  const zones = [
    { key: 'ideal', label: '이상', pct: zone_pct.ideal, color: '#10b981' },
    { key: 'good', label: '양호', pct: zone_pct.good, color: '#3b82f6' },
    { key: 'caution', label: '주의', pct: zone_pct.caution, color: '#f59e0b' },
    { key: 'stress', label: '위험', pct: zone_pct.stress, color: '#ef4444' },
  ];

  // SOC pointer position (0-100 mapped to bar width)
  const socPosition = avg_soc;

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      {/* 상단: 게이지 + 점수 + 등급 */}
      <div className="flex items-center gap-4 px-4 pt-4 pb-3 border-b border-white/[0.06]">
        {/* 게이지 */}
        <div className="flex-shrink-0 flex flex-col items-center">
          <div className="relative" style={{ width: SIZE, height: Math.round(SIZE * 0.65) }}>
            <svg
              width={SIZE}
              height={Math.round(SIZE * 0.65)}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              style={{ overflow: 'visible' }}
            >
              <path d={trackPath} fill="none" stroke="#27272a" strokeWidth={STROKE} strokeLinecap="round" />
              {progressPath && (
                <path d={progressPath} fill="none" stroke={arcColor} strokeWidth={STROKE} strokeLinecap="round" />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingTop: 8 }}>
              <div className="flex items-baseline gap-0.5">
                <span className="text-[26px] font-black leading-none tabular-nums text-white">{score}</span>
                <span className="text-[10px] text-zinc-600 ml-0.5">점</span>
              </div>
            </div>
          </div>
          <div className="mt-0.5" />
        </div>

        {/* 오른쪽: 핵심 수치 + 팁 */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] text-zinc-600 flex-shrink-0">평균 SOC <span className="text-zinc-700">({battery_type})</span></span>
            <span className="text-[13px] font-bold tabular-nums text-white">
              {avg_soc}%
            </span>
          </div>
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] text-zinc-600 flex-shrink-0">등급</span>
            <span className="text-[13px] font-black tabular-nums" style={{ color: arcColor }}>
              {grade}
            </span>
          </div>
        </div>
      </div>

      {/* SOC 분포 히스토그램 */}
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-semibold text-zinc-400">SOC 체류 분포</span>
          {tips?.[0] && <span className="text-[11px] text-zinc-500">💡 {tips[0]}</span>}
        </div>
        {/* 50% 이상적 라인 표시 + 바 */}
        <div className="relative">
          <div className="flex items-end gap-0.5" style={{ height: histH }}>
            {soc_histogram.map((cnt, i) => {
              const h = maxHist > 0 ? Math.max(2, Math.round((cnt / maxHist) * histH)) : 2;
              const bucketMid = i * 10 + 5;
              const halfRange = (range_high - range_low) / 2;
              let color, zone;
              if (bucketMid >= range_low && bucketMid <= range_high) {
                const distPct = Math.abs(bucketMid - optimal_center) / halfRange;
                if (distPct <= 0.4) { color = '#10b981'; zone = 'ideal'; }
                else { color = '#3b82f6'; zone = 'good'; }
              } else if (bucketMid >= 10 && bucketMid <= 90) {
                color = '#f59e0b'; zone = 'caution';
              } else {
                color = '#ef4444'; zone = 'stress';
              }
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm transition-all duration-500"
                  style={{
                    height: h,
                    background: color,
                    opacity: cnt === 0 ? 0.12 : zone === 'ideal' ? 1 : zone === 'good' ? 0.8 : 0.7,
                  }}
                  title={`${i * 10}–${i * 10 + 10}%: ${cnt.toLocaleString()}회`}
                />
              );
            })}
          </div>
          {/* 최적 중심 마커 */}
          <div className="absolute top-0 bottom-0" style={{ left: optimal_center + '%', transform: 'translateX(-50%)' }}>
            <div className="w-px h-full bg-emerald-400/40 border-dashed" />
          </div>
        </div>
        {/* 퍼센트 숫자 - 구간별 색상 */}
        <div className="flex justify-between mt-1">
          {['0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100%'].map((l, i) => {
            const bucketIdx = Math.min(i, 9);
            const bucketMid = bucketIdx * 10 + 5;
            const halfRange = (range_high - range_low) / 2;
            let numColor;
            if (bucketMid >= range_low && bucketMid <= range_high) {
              const distPct = Math.abs(bucketMid - optimal_center) / halfRange;
              numColor = distPct <= 0.4 ? '#10b981' : '#3b82f6';
            } else if (bucketMid >= 10 && bucketMid <= 90) {
              numColor = '#f59e0b';
            } else {
              numColor = '#ef4444';
            }
            return (
              <span key={i} className="text-[8px] tabular-nums font-bold" style={{ color: numColor }}>{l}</span>
            );
          })}
        </div>
        {/* 구간 체류 비율 */}
        <div className="flex justify-around mt-2 pt-1.5 border-t border-white/[0.04]">
          {[
            { key: 'stress', label: '위험', color: '#ef4444' },
            { key: 'caution', label: '주의', color: '#f59e0b' },
            { key: 'good', label: '양호', color: '#3b82f6' },
            { key: 'ideal', label: '이상', color: '#10b981' },
          ].map(({ key, label, color }) => (
            <div key={key} className="flex items-center gap-1">
              <span className="text-xs font-semibold" style={{ color: color + 'cc' }}>{label}</span>
              <span className="text-sm font-black tabular-nums" style={{ color }}>{zone_pct[key]}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
