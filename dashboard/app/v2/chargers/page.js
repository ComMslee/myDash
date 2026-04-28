'use client';

import { useState, useEffect } from 'react';
import HomeChargerCard from '@/app/v2/battery/HomeChargerCard';
import { RankRow, HeatmapChart } from '@/app/v2/battery/home-charger/FleetStatsCharts';
import { formatEntry } from '@/app/v2/battery/home-charger/fleet-stats-utils';

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

function formatPeak({ date, hour }) {
  const [y, m, d] = date.split('-').map(Number);
  const dow = DOW_KO[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const sameYear = y === new Date().getFullYear();
  const head = sameYear ? `${m}/${d}` : `${String(y).slice(2)}/${m}/${d}`;
  return `${head} (${dow}) ${hour}시`;
}

// ── 집충전기 상세 — FleetStatsPopup 패널화 ───────────────────
function FleetStatsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/home-charger/fleet-stats', { cache: 'no-store' });
        const d = await res.json();
        if (!alive) return;
        if (d.error) setError(d.error); else setData(d);
      } catch (e) {
        if (alive) setError(e.message || '조회 실패');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const TOP_VISIBLE = 15;
  const perCharger = data?.perCharger || [];
  const top3 = perCharger.slice(0, 3);
  const mid12 = perCharger.slice(3, TOP_VISIBLE);
  const restN = perCharger.slice(TOP_VISIBLE);
  const topMax = top3[0]?.count || 1;
  const top3Icons = ['🥇', '🥈', '🥉'];

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-widest uppercase text-zinc-500">집충전기 상세 현황</span>
        <span className="text-[10px] text-zinc-600">전체 기간</span>
      </div>

      <div className="px-4 py-3 space-y-3">
        {loading && (
          <div className="flex justify-center py-6">
            <div className="w-5 h-5 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
          </div>
        )}
        {error && <div className="text-[12px] text-rose-400 py-2">조회 실패 — {error}</div>}

        {!loading && !error && data && (
          perCharger.length === 0 ? (
            <div className="text-center text-[12px] text-zinc-500 py-6">
              아직 기록된 사용 데이터가 없습니다.
            </div>
          ) : (
            <>
              {/* 전체 순위 */}
              <div>
                <div className="text-[11px] text-zinc-400 mb-1.5">
                  🏆 전체 순위 <span className="text-zinc-600">· 총 {perCharger.length}대</span>
                </div>
                {/* Top 1~3 — 강조 카드 (한 줄 3칸, 크게) */}
                {top3.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {top3.map((e, i) => {
                      const isPeak = i === 0;
                      const ratio = topMax > 0 ? e.count / topMax : 0;
                      const accent = isPeak ? '#f59e0b' : '#3b82f6';
                      return (
                        <div
                          key={e.key}
                          className="relative bg-white/[0.04] border border-white/[0.08] rounded-lg p-2 pl-3 flex flex-col items-center justify-center gap-1 overflow-hidden"
                          title={`${formatEntry(e.key)}: ${e.count}회`}
                        >
                          <div
                            className="absolute left-0 top-0 bottom-0 w-1"
                            style={{ background: accent, opacity: 0.4 + ratio * 0.6 }}
                          />
                          <div className="text-2xl leading-none">{top3Icons[i]}</div>
                          <div className="text-[11px] text-zinc-200 truncate w-full text-center font-medium">
                            {formatEntry(e.key)}
                          </div>
                          <div className="flex items-baseline gap-1">
                            <span className={`text-base font-bold tabular-nums ${isPeak ? 'text-amber-400' : 'text-zinc-200'}`}>
                              {e.count}
                            </span>
                            <span className="text-[9px] text-zinc-500">회</span>
                            {e.isNew && (
                              <span className="text-[9px] font-semibold text-amber-400 ml-0.5" title="어제까지 미사용">NEW</span>
                            )}
                            {!e.isNew && e.delta != null && e.delta > 0 && (
                              <span className="text-[9px] tabular-nums text-emerald-400 ml-0.5" title={`어제 ${e.prevRank}위 → ${e.delta}등 상승`}>▲{e.delta}</span>
                            )}
                            {!e.isNew && e.delta != null && e.delta < 0 && (
                              <span className="text-[9px] tabular-nums text-rose-400 ml-0.5" title={`어제 ${e.prevRank}위 → ${-e.delta}등 하락`}>▼{-e.delta}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* 4~15위 — 2칸 그리드 */}
                {mid12.length > 0 && (
                  <div
                    className="grid grid-cols-2 grid-flow-col gap-x-2 gap-y-0.5"
                    style={{ gridTemplateRows: `repeat(${Math.ceil(mid12.length / 2)}, auto)` }}
                  >
                    {mid12.map((e, i) => (
                      <RankRow
                        key={e.key}
                        icon={String(i + 4)}
                        label={formatEntry(e.key)}
                        count={e.count}
                        max={topMax}
                        delta={e.delta}
                        isNew={e.isNew}
                        prevRank={e.prevRank}
                      />
                    ))}
                  </div>
                )}
                {expanded && restN.length > 0 && (
                  <div
                    className="mt-1 grid grid-cols-3 grid-flow-col gap-x-2 gap-y-0.5"
                    style={{ gridTemplateRows: `repeat(${Math.ceil(restN.length / 3)}, auto)` }}
                  >
                    {restN.map((e, i) => (
                      <RankRow
                        key={e.key}
                        icon={String(i + TOP_VISIBLE + 1)}
                        label={formatEntry(e.key)}
                        count={e.count}
                        max={topMax}
                      />
                    ))}
                  </div>
                )}
                {restN.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpanded(v => !v)}
                    className="mt-1.5 w-full py-1 text-[11px] bg-white/[0.04] hover:bg-white/[0.08] rounded text-zinc-400"
                  >
                    {expanded ? '▲ 접기' : `▼ 나머지 ${restN.length}대 보기`}
                  </button>
                )}
              </div>

              {/* 시간×요일 히트맵 */}
              <div className="pt-2 border-t border-white/[0.04]">
                <div className="text-[11px] text-zinc-400 mb-1.5 flex items-center justify-between gap-2">
                  <span>📊 시간×요일 히트맵</span>
                  {data.lastPeak && data.lastPeak.count > 0 && (
                    <span className="text-zinc-500">
                      🔥 {formatPeak(data.lastPeak)} · {data.lastPeak.count}대
                    </span>
                  )}
                </div>
                {(data.heatmap || []).flat().every(v => v === 0) ? (
                  <div className="text-[11px] text-zinc-600 py-2">
                    집계는 일별 수집 시작일부터 가능 — 며칠 뒤 확인
                  </div>
                ) : (
                  <HeatmapChart heatmap={data.heatmap} />
                )}
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}

// ── 페이지 ────────────────────────────────────────────────────
export default function V2ChargersPage() {
  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 py-5 pb-24 flex flex-col gap-5">
        {/* 집충전기 실시간 현황 (P1/그 외 + 상태 배지) */}
        <HomeChargerCard showFavLabel />

        {/* 집충전기 누적 사용 — Top 10 + 시간×요일 히트맵 (구 팝업 → 패널) */}
        <FleetStatsPanel />
      </div>
    </main>
  );
}
