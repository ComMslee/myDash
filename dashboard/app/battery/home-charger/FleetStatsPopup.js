'use client';
import { useEffect, useState, useRef } from 'react';
import { formatEntry } from './fleet-stats-utils';
import { RankRow, HourlyChart, DowChart } from './FleetStatsCharts';

// 단지 전체 충전기 현황 상세 팝업 — 바텀 시트 (모바일 우선), 기간 슬라이더 1~12개월
export default function FleetStatsPopup({ onClose }) {
  const [months, setMonths] = useState(3);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  // ESC로 닫기
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 슬라이더 변경 시 debounce 후 재조회
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/home-charger/fleet-stats?months=${months}`, { cache: 'no-store' });
        const d = await res.json();
        if (d.error) setError(d.error);
        else setData(d);
      } catch (e) {
        setError(e.message || '조회 실패');
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [months]);

  const topN = (data?.perCharger || []).slice(0, 5);
  // Bottom도 desc 정렬 유지 — Top과 동일한 방향 (큰 것 위, 작은 것 아래)
  const bottomN = (data?.perCharger || []).slice(-5);
  const topMax = topN[0]?.count || 1;
  const bottomMax = bottomN[0]?.count || 1;

  // 팝업 열렸을 때 body 스크롤 잠금 (모바일에서 백드롭 스크롤 체이닝 방지)
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
          {/* 기간 슬라이더 */}
          <div>
            <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
              <span>기간</span>
              <span className="tabular-nums text-zinc-200">{months}개월</span>
            </div>
            <input
              type="range"
              min="1"
              max="12"
              step="1"
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-[9px] text-zinc-600 tabular-nums mt-0.5">
              <span>1</span><span>3</span><span>6</span><span>9</span><span>12</span>
            </div>
          </div>

          {loading && (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
            </div>
          )}
          {error && (
            <div className="text-[12px] text-rose-400">조회 실패 — {error}</div>
          )}

          {!loading && !error && data && (
            <>
              {/* 총괄 — 기간(시간대/요일) + 전체(순위) */}
              <div className="bg-[#1a1a1c] border border-white/[0.06] rounded-lg px-3 py-2 text-[12px] space-y-1">
                <div className="flex items-center justify-between tabular-nums">
                  <span className="text-zinc-400">전체 기간 누적</span>
                  <span className="text-zinc-200 font-semibold">{data.allTimeTotal}회</span>
                </div>
                <div className="flex items-center justify-between tabular-nums">
                  <span className="text-zinc-500">지난 {data.months}개월 기록</span>
                  <span className="text-zinc-400">{data.total}회 · {data.daysCovered}일</span>
                </div>
                <div className="flex items-center justify-between tabular-nums">
                  <span className="text-zinc-500">일 평균 (기간)</span>
                  <span className="text-zinc-400">
                    {data.daysCovered > 0 ? (data.total / data.daysCovered).toFixed(1) : '-'}회/일
                  </span>
                </div>
                <div className="text-[10px] text-zinc-600 leading-snug pt-0.5">
                  * 카운트 = 충전중 상태로 관측된 30분 버킷 수 (시간당 최대 2)
                  <br />
                  * Top/Bottom 순위는 <b>전체 기간</b>, 시간대/요일은 <b>선택 기간</b> 기준
                </div>
              </div>

              {data.perCharger.length === 0 ? (
                <div className="text-center text-[12px] text-zinc-500 py-6">
                  아직 기록된 사용 데이터가 없습니다.
                </div>
              ) : (
                <>
                  {/* Top / Bottom — 2열 그리드 (전체 기간 누적) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] text-zinc-400 mb-1.5">🏆 Top 5</div>
                      <div className="space-y-0.5">
                        {topN.map((e, i) => (
                          <RankRow
                            key={e.key}
                            icon={['🥇', '🥈', '🥉', '4', '5'][i]}
                            label={formatEntry(e.key)}
                            count={e.count}
                            max={topMax}
                            isPeak={i === 0}
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-zinc-400 mb-1.5">🐢 Bottom 5</div>
                      <div className="space-y-0.5">
                        {bottomN.map((e) => (
                          <RankRow
                            key={e.key}
                            icon="·"
                            label={formatEntry(e.key)}
                            count={e.count}
                            max={bottomMax}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 시간대 — 항상 전체 기간 누적 (랭크와 동일 소스 → 수치 일관성) */}
                  <div>
                    <div className="text-[11px] text-zinc-400 mb-1.5">
                      📈 시간대별 (24시간) <span className="text-zinc-600">· 전체 기간</span>
                    </div>
                    <HourlyChart hourly={data.hourlyAllTime} />
                  </div>

                  {/* 요일 — 선택 기간 (일별 수집 전엔 불가) */}
                  <div>
                    <div className="text-[11px] text-zinc-400 mb-1.5">
                      📅 요일별 활성도 <span className="text-zinc-600">· 지난 {data.months}개월</span>
                    </div>
                    {data.daysCovered === 0 ? (
                      <div className="text-[11px] text-zinc-600 py-2">
                        요일별 집계는 일별 수집 시작일부터 가능 — 며칠 뒤 확인
                      </div>
                    ) : (
                      <DowChart dow={data.dow} />
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
