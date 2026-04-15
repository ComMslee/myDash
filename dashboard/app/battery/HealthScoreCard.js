'use client';

export default function HealthScoreCard({ data }) {
  const {
    score,
    grade,
    avg_soc,
    optimal_center = 50,
    range_low = 20,
    range_high = 80,
    total_readings,
    soc_histogram,
    soc_histogram_5,
    zone_pct,
    tips,
  } = data;

  if (total_readings === 0) {
    return (
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-6 text-center">
        <div className="text-zinc-600 text-sm">SOC 데이터가 아직 없습니다</div>
      </div>
    );
  }

  // 5% 단위가 있으면 20칸, 없으면 10칸 fallback
  const hist = soc_histogram_5 && soc_histogram_5.length === 20 ? soc_histogram_5 : soc_histogram;
  const bucketSize = hist.length === 20 ? 5 : 10;
  const maxHist = Math.max(1, ...hist);
  const histH = 44;

  const arcColor = score >= 80 ? '#10b981' : score >= 60 ? '#3b82f6'
    : score >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      {/* 상단: 점수 · SOC · 등급 — 간소화 한 줄 */}
      <div className="flex items-center justify-around px-4 py-3 border-b border-white/[0.06]">
        <div className="text-center">
          <p className="text-[10px] text-zinc-600 mb-0.5">점수</p>
          <p className="text-xl font-black leading-none tabular-nums" style={{ color: arcColor }}>
            {score}<span className="text-xs text-zinc-600 font-normal ml-0.5">점</span>
          </p>
        </div>
        <div className="w-px h-8 bg-white/[0.06]" />
        <div className="text-center">
          <p className="text-[10px] text-zinc-600 mb-0.5">평균 SOC</p>
          <p className="text-xl font-black text-white leading-none tabular-nums">
            {avg_soc}<span className="text-xs text-zinc-600 font-normal ml-0.5">%</span>
          </p>
        </div>
        <div className="w-px h-8 bg-white/[0.06]" />
        <div className="text-center">
          <p className="text-[10px] text-zinc-600 mb-0.5">등급</p>
          <p className="text-xl font-black leading-none tabular-nums" style={{ color: arcColor }}>
            {grade}
          </p>
        </div>
      </div>

      {/* SOC 체류 분포 — 5% 단위 */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-semibold text-zinc-400">SOC 체류 분포</span>
          {tips?.[0] && <span className="text-[11px] text-zinc-500">💡 {tips[0]}</span>}
        </div>
        <div className="relative">
          <div className="flex items-end gap-0.5" style={{ height: histH }}>
            {hist.map((cnt, i) => {
              const h = maxHist > 0 ? Math.max(2, Math.round((cnt / maxHist) * histH)) : 2;
              const bucketMid = i * bucketSize + bucketSize / 2;
              const halfRange = (range_high - range_low) / 2;
              let color, zone;
              if (bucketMid >= range_low && bucketMid <= range_high) {
                const distPct = halfRange > 0 ? Math.abs(bucketMid - optimal_center) / halfRange : 0;
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
                  title={`${i * bucketSize}–${i * bucketSize + bucketSize}%: ${cnt.toLocaleString()}회`}
                />
              );
            })}
          </div>
          {/* 최적 중심 마커 */}
          <div className="absolute top-0 bottom-0" style={{ left: optimal_center + '%', transform: 'translateX(-50%)' }}>
            <div className="w-px h-full bg-emerald-400/40" />
          </div>
        </div>
        {/* 0 / 중심 / 100 축 */}
        <div className="flex justify-between mt-1 text-[9px] tabular-nums text-zinc-600">
          <span>0</span>
          <span>25</span>
          <span>50</span>
          <span>75</span>
          <span>100%</span>
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
