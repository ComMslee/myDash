'use client';
import { useEffect, useState } from 'react';
import { formatEntry } from './fleet-stats-utils';
import { RankRow, HourlyChart, DowChart } from './FleetStatsCharts';

// 단지 전체 충전기 현황 상세 팝업 — 모든 섹션 전체 기간 누적
export default function FleetStatsPopup({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/home-charger/fleet-stats`, { cache: 'no-store' });
        const d = await res.json();
        if (!alive) return;
        if (d.error) setError(d.error);
        else setData(d);
      } catch (e) {
        if (alive) setError(e.message || '조회 실패');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const topN = (data?.perCharger || []).slice(0, 10);
  const restN = (data?.perCharger || []).slice(10);
  const topMax = topN[0]?.count || 1;
  const rankIcons = ['🥇', '🥈', '🥉', '4', '5', '6', '7', '8', '9', '10'];

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full sm:max-w-lg bg-[#161618] border border-white/[0.08] rounded-2xl max-h-[75dvh] sm:max-h-[75vh] overflow-y-auto overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-[#161618] border-b border-white/[0.06] px-4 py-1.5 flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-200">집충전기 상세 현황</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-7 h-7 rounded-md hover:bg-white/[0.06] flex items-center justify-center text-zinc-400 hover:text-zinc-200"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-2 space-y-2.5 pb-5">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
            </div>
          )}
          {error && (
            <div className="text-[12px] text-rose-400">조회 실패 — {error}</div>
          )}

          {!loading && !error && data && (
            data.perCharger.length === 0 ? (
              <div className="text-center text-[12px] text-zinc-500 py-6">
                아직 기록된 사용 데이터가 없습니다.
              </div>
            ) : (
              <>
                {/* Top / Bottom — 전체 기간 누적 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] text-zinc-400 mb-1.5">🏆 Top 10</div>
                    <div className="space-y-0.5">
                      {topN.map((e, i) => (
                        <RankRow
                          key={e.key}
                          icon={rankIcons[i]}
                          label={formatEntry(e.key)}
                          count={e.count}
                          max={topMax}
                          isPeak={i === 0}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-zinc-400 mb-1.5">🐢 하위</div>
                    {restN.length === 0 ? (
                      <div className="text-[10px] text-zinc-600 py-1">없음</div>
                    ) : (
                      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                        {restN.map((e, i) => (
                          <div
                            key={e.key}
                            className="flex items-center gap-1 text-[10px] tabular-nums h-5 cursor-help"
                            title={`${formatEntry(e.key)}: ${e.count}회`}
                          >
                            <span className="text-zinc-500 w-5 text-right shrink-0">{i + 11}</span>
                            <span className="text-zinc-300 truncate">{formatEntry(e.key)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 시간대 — 전체 기간 */}
                <div>
                  <div className="text-[11px] text-zinc-400 mb-1.5">
                    📈 시간대별 (24시간) <span className="text-zinc-600">· 전체 기간</span>
                  </div>
                  <HourlyChart hourly={data.hourlyAllTime} />
                </div>

                {/* 요일 — 전체 기간 */}
                <div>
                  <div className="text-[11px] text-zinc-400 mb-1.5">
                    📅 요일별 활성도 <span className="text-zinc-600">· 전체 기간</span>
                  </div>
                  {(data.dowAllTime || []).every(v => v === 0) ? (
                    <div className="text-[11px] text-zinc-600 py-2">
                      요일별 집계는 일별 수집 시작일부터 가능 — 며칠 뒤 확인
                    </div>
                  ) : (
                    <DowChart dow={data.dowAllTime} />
                  )}
                </div>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
