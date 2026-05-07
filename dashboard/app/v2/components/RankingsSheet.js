'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDuration, shortAddr, formatKorDateTime, formatKorDay } from '@/lib/format';

// ── Context ────────────────────────────────────────────────────
const RankingsSheetContext = createContext(null);

export function useRankingsSheet() {
  return useContext(RankingsSheetContext);
}

// ── 상수 ──────────────────────────────────────────────────────
const METRIC_TABS = [
  { metric: 'distance', label: '거리' },
  { metric: 'duration', label: '시간' },
  { metric: 'avg_speed', label: '속도' },
  { metric: 'eff',       label: '효율', isNew: true },
];
const BASE_TABS = [
  { base: 'drive', label: '단일 주행' },
  { base: 'day',   label: '일 합계' },
];

// metric × base → API type 매핑 (eff는 미지원)
function toApiType(metric, base) {
  if (metric === 'eff') return null;
  return `${base}_${metric}`;
}

// ── 시트 내부 ──────────────────────────────────────────────────
function SheetContent({ metric, base, onClose }) {
  const router = useRouter();
  const [curMetric, setCurMetric] = useState(metric);
  const [curBase, setCurBase] = useState(base);
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const apiType = toApiType(curMetric, curBase);

  useEffect(() => {
    if (!apiType) { setItems(null); setError(null); return; }
    setItems(null);
    setError(null);
    setLoading(true);
    fetch(`/api/rankings?type=${apiType}&limit=50`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setItems(d.items || []);
      })
      .catch(() => setError('데이터를 불러오지 못했습니다'))
      .finally(() => setLoading(false));
  }, [apiType]);

  const isDrive = curBase === 'drive';
  const isDistance = curMetric === 'distance';
  const isDuration = curMetric === 'duration';
  const isSpeed = curMetric === 'avg_speed';
  const isEff = curMetric === 'eff';

  function handleItemClick(it) {
    onClose();
    if (isDrive) {
      router.push(`/v2/history?id=${it.id}`);
    } else {
      router.push(`/v2/history?date=${it.day}`);
    }
  }

  return (
    <>
      {/* 핸들바 */}
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 rounded-full bg-zinc-700" />
      </div>

      {/* 제목 + 닫기 */}
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-sm font-bold text-zinc-200">TOP 50 기록</span>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          aria-label="닫기"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 지표 탭 */}
      <div className="grid grid-cols-4 gap-1 px-4 mb-2">
        {METRIC_TABS.map(t => (
          <button
            key={t.metric}
            onClick={() => setCurMetric(t.metric)}
            className={`py-1.5 text-center rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
              curMetric === t.metric
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                : 'bg-zinc-800/60 text-zinc-500 border border-white/[0.06]'
            }`}
          >
            {t.label}
            {t.isNew && (
              <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-gradient-to-br from-blue-500 to-violet-500 text-white leading-none">NEW</span>
            )}
          </button>
        ))}
      </div>

      {/* 기준 탭 */}
      <div className="grid grid-cols-2 gap-1 px-4 mb-3">
        {BASE_TABS.map(t => (
          <button
            key={t.base}
            onClick={() => setCurBase(t.base)}
            className={`py-1.5 text-center rounded-lg text-xs font-semibold transition-colors ${
              curBase === t.base
                ? 'bg-zinc-700/70 text-zinc-100'
                : 'bg-zinc-800/50 text-zinc-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 콘텐츠 */}
      <div className="overflow-y-auto flex-1 px-4 pb-6">
        {isEff ? (
          <div className="py-16 text-center text-zinc-500 text-sm">
            <p className="text-2xl mb-3">🔜</p>
            <p>효율 랭킹은 준비 중입니다</p>
            <p className="text-xs text-zinc-600 mt-1">실제 소비 kWh 데이터 연동 후 제공 예정</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="py-16 text-center text-red-400 text-sm">{error}</div>
        ) : !items ? null : items.length === 0 ? (
          <div className="py-16 text-center text-zinc-600 text-sm">기록이 없습니다</div>
        ) : (
          <div className="bg-[#1a1a1c] border border-white/[0.06] rounded-2xl overflow-hidden">
            {items.map((it, idx) => {
              const rankColor = idx < 3 ? 'text-amber-400' : 'text-zinc-600';
              return (
                <button
                  key={isDrive ? it.id : it.day}
                  onClick={() => handleItemClick(it)}
                  className="w-full grid grid-cols-[28px_1fr_auto] items-center gap-2 px-4 py-3 border-b border-white/[0.05] last:border-0 hover:bg-white/[0.03] transition-colors text-left"
                >
                  <span className={`text-sm font-black tabular-nums text-center ${rankColor}`}>{idx + 1}</span>
                  <div className="min-w-0">
                    {isDrive ? (
                      <>
                        <p className="text-xs text-zinc-500 tabular-nums">{formatKorDateTime(it.start_date)}</p>
                        <p className="text-sm text-zinc-300 truncate">
                          {shortAddr(it.start_address) || '?'}
                          <span className="text-zinc-600 mx-1">→</span>
                          {shortAddr(it.end_address) || '?'}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-zinc-500 tabular-nums">{formatKorDay(it.day)}</p>
                        <p className="text-sm text-zinc-300">{it.drive_count}회 주행</p>
                      </>
                    )}
                  </div>
                  <div className="text-right tabular-nums">
                    {isDistance && (
                      <>
                        <p className="text-base font-bold text-blue-400">
                          {isDrive ? it.distance : it.total_distance}
                          <span className="text-xs font-medium text-zinc-600 ml-0.5">km</span>
                        </p>
                        {isDrive && it.duration_min && (
                          <p className="text-xs text-zinc-500">{formatDuration(it.duration_min)}</p>
                        )}
                      </>
                    )}
                    {isDuration && (
                      <>
                        <p className="text-sm font-bold text-zinc-200">
                          {formatDuration(isDrive ? it.duration_min : it.total_duration)}
                        </p>
                        {isDrive && it.distance > 0 && (
                          <p className="text-xs text-blue-400/80">
                            {it.distance}<span className="text-zinc-600 ml-0.5">km</span>
                          </p>
                        )}
                      </>
                    )}
                    {isSpeed && (
                      <>
                        <p className="text-base font-bold text-amber-400">
                          {it.avg_speed ?? '—'}<span className="text-xs font-medium text-zinc-600 ml-0.5">km/h</span>
                        </p>
                        {isDrive && it.distance > 0 && (
                          <p className="text-xs text-blue-400/80">
                            {it.distance}<span className="text-zinc-600 ml-0.5">km</span>
                          </p>
                        )}
                        {!isDrive && it.total_distance > 0 && (
                          <p className="text-xs text-blue-400/80">
                            {it.total_distance}<span className="text-zinc-600 ml-0.5">km</span>
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

// ── Provider ───────────────────────────────────────────────────
export function RankingsSheetProvider({ children }) {
  const [sheetState, setSheetState] = useState(null); // null = 닫힘
  const [visible, setVisible] = useState(false);       // 애니메이션 제어
  const timerRef = useRef(null);

  const open = useCallback((metric = 'distance', base = 'drive') => {
    clearTimeout(timerRef.current);
    setSheetState({ metric, base });
    // 다음 프레임에 visible=true로 슬라이드업
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    timerRef.current = setTimeout(() => setSheetState(null), 320);
  }, []);

  // 배경 클릭 닫기
  function handleBackdrop(e) {
    if (e.target === e.currentTarget) close();
  }

  return (
    <RankingsSheetContext.Provider value={{ open, close }}>
      {children}
      {sheetState && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center"
          onClick={handleBackdrop}
          style={{ background: visible ? 'rgba(0,0,0,0.6)' : 'transparent', transition: 'background 0.3s' }}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-[#161618] rounded-t-3xl overflow-hidden"
            style={{
              transform: visible ? 'translateY(0)' : 'translateY(100%)',
              transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
            }}
          >
            <SheetContent metric={sheetState.metric} base={sheetState.base} onClose={close} />
          </div>
        </div>
      )}
    </RankingsSheetContext.Provider>
  );
}
