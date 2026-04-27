'use client';

import { useState, useEffect } from 'react';
import HomeChargerCard from '@/app/v1/battery/HomeChargerCard';
import { RankRow, HeatmapChart } from '@/app/v1/battery/home-charger/FleetStatsCharts';
import { formatEntry } from '@/app/v1/battery/home-charger/fleet-stats-utils';

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

  const TOP_VISIBLE = 10;
  const perCharger = data?.perCharger || [];
  const topN = perCharger.slice(0, TOP_VISIBLE);
  const restN = perCharger.slice(TOP_VISIBLE);
  const topMax = topN[0]?.count || 1;
  const rankIcons = ['🥇', '🥈', '🥉', '4', '5', '6', '7', '8', '9', '10'];

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
                <div
                  className="grid grid-cols-2 grid-flow-col gap-x-2 gap-y-0.5"
                  style={{ gridTemplateRows: `repeat(${Math.ceil(topN.length / 2)}, auto)` }}
                >
                  {topN.map((e, i) => (
                    <RankRow
                      key={e.key}
                      icon={rankIcons[i]}
                      label={formatEntry(e.key)}
                      count={e.count}
                      max={topMax}
                      isPeak={i === 0}
                      delta={e.delta}
                      isNew={e.isNew}
                      prevRank={e.prevRank}
                    />
                  ))}
                </div>
                {expanded && restN.length > 0 && (
                  <div
                    className="mt-1 grid grid-cols-4 grid-flow-col gap-x-2 gap-y-0.5"
                    style={{ gridTemplateRows: `repeat(${Math.ceil(restN.length / 4)}, auto)` }}
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
        <HomeChargerCard />

        {/* 집충전기 누적 사용 — Top 10 + 시간×요일 히트맵 (구 팝업 → 패널) */}
        <FleetStatsPanel />
      </div>
    </main>
  );
}
