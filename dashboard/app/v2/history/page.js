'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMock } from '@/app/context/mock';
import { formatDuration, shortAddr } from '@/lib/format';
import { kstDateStr, kstMondayStr } from '@/lib/kst';
import DriveMap, { loadLeaflet } from '@/app/components/DriveMap';
import RouteSparklines from '@/app/components/RouteSparklines';
import DriveListView from '@/app/v2/history/DriveListView';
import DriveStatsLine, { routePosStats } from '@/app/v2/history/DriveStatsLine';
import PlacesPanel from '@/app/v2/history/PlacesPanel';
import MapSummaryHeader from '@/app/v2/history/MapSummaryHeader';
import { useDriveData } from '@/app/v2/history/useDriveData';

function isValidDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function HistoryInner() {
  const { isMock, refreshSignal } = useMock();
  const searchParams = useSearchParams();
  const rawId = parseInt(searchParams.get('id') || '');
  const initialId = Number.isFinite(rawId) ? rawId : null;
  const dateParamRaw = searchParams.get('date');
  const initialDate = isValidDateStr(dateParamRaw) ? dateParamRaw : null;

  // Leaflet CDN 사전 로드 — 첫 항목 클릭 시 1~2초 다운로드 지연 제거
  useEffect(() => { loadLeaflet(() => {}); }, []);

  const driveDayStr = (d) => kstDateStr(d.start_date);

  const {
    drives, places, longStayPlaces,
    selectedDrive, setSelectedDrive,
    positions, setPositions,
    routeData,
    dayMode, setDayMode,
    dayRoutes,
    monthMode, setMonthMode,
    monthRoutes,
    weekMode, setWeekMode,
    weekRoutes,
    loadingDrives, loadingRoute,
    error,
  } = useDriveData({ isMock, refreshSignal, initialId, initialDate, driveDayStr });

  const [selectedPlace, setSelectedPlace] = useState(null);
  const [placesExpanded, setPlacesExpanded] = useState(false);
  const [placesCollapsed, setPlacesCollapsed] = useState(false);
  // 'frequent' = 자주 가는 곳(방문 횟수) | 'long-stay' = 오래 머문 곳(체류 시간)
  const [placesMode, setPlacesMode] = useState('frequent');

  const entryInMapView = !!initialId || !!initialDate;
  const [viewMode, setViewMode] = useState(entryInMapView ? 'map' : 'list');

  // 모바일(<=768px) — dayMode 리스트 3행 / 데스크톱 5행 고정, 초과 운행 수일 때 내부 스크롤.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (viewMode === 'map') {
      setPlacesCollapsed(true);
      setPlacesExpanded(false);
    } else {
      setPlacesCollapsed(false);
    }
  }, [viewMode]);

  // list 모드는 페이지 전체 스크롤 — body 잠금 skip. map/day 는 내부 컨테이너 스크롤이라 잠금.
  useEffect(() => {
    if (viewMode === 'list') return;
    const htmlPrev = document.documentElement.style.overflow;
    const bodyPrev = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = htmlPrev;
      document.body.style.overflow = bodyPrev;
    };
  }, [viewMode]);

  const [mapEverShown, setMapEverShown] = useState(entryInMapView);
  const selectedIdx = selectedDrive ? drives.findIndex(d => d.id === selectedDrive.id) : -1;

  const [selectedPosIdx, setSelectedPosIdx] = useState(null);
  useEffect(() => { setSelectedPosIdx(null); }, [selectedDrive?.id, dayMode, monthMode, weekMode]);
  // dayMode 컴팩트 strip 에서 선택된 drive — 지도에서 해당 polyline 만 강조 + zoom.
  const [selectedDayDriveId, setSelectedDayDriveId] = useState(null);
  useEffect(() => { setSelectedDayDriveId(null); }, [dayMode]);

  const sparkRoutes = useMemo(() => {
    if (monthMode && monthRoutes?.length) {
      return monthRoutes.filter(r => r.positions?.length >= 2).map(r => ({ positions: r.positions, startDate: r.startDate, color: r.color }));
    }
    if (weekMode && weekRoutes?.length) {
      return weekRoutes.filter(r => r.positions?.length >= 2).map(r => ({ positions: r.positions, startDate: r.startDate, color: r.color }));
    }
    if (dayMode && dayRoutes?.length) {
      return dayRoutes.filter(r => r.positions?.length >= 2).map(r => ({ positions: r.positions, startDate: r.startDate, color: r.color }));
    }
    if (selectedDrive && positions?.length >= 2) {
      return [{ positions, startDate: selectedDrive.start_date, color: '#3b82f6' }];
    }
    return [];
  }, [monthMode, monthRoutes, weekMode, weekRoutes, dayMode, dayRoutes, selectedDrive, positions]);

  const highlightLatLng = useMemo(() => {
    if (selectedPosIdx == null) return null;
    let idx = selectedPosIdx;
    for (const r of sparkRoutes) {
      if (idx < r.positions.length) {
        const p = r.positions[idx];
        return p ? { lat: p.lat, lng: p.lng } : null;
      }
      idx -= r.positions.length;
    }
    return null;
  }, [selectedPosIdx, sparkRoutes]);

  const goToDay = (dateStr) => { setDayMode(dateStr); setMonthMode(null); setWeekMode(null); setSelectedPlace(null); setMapEverShown(true); setViewMode('map'); };
  const goToMonth = (monthStr) => { setMonthMode(monthStr); setDayMode(null); setWeekMode(null); setSelectedDrive(null); setSelectedPlace(null); setPositions([]); setMapEverShown(true); setViewMode('map'); };
  const goToWeek = (weekKey) => { setWeekMode(weekKey); setMonthMode(null); setDayMode(null); setSelectedDrive(null); setSelectedPlace(null); setPositions([]); setMapEverShown(true); setViewMode('map'); };
  const goToPlace = (p) => { setSelectedPlace(p); setSelectedDrive(null); setPositions([]); setMonthMode(null); setWeekMode(null); setMapEverShown(true); setViewMode('map'); };

  const uniqueDays = useMemo(() => {
    if (!drives.length) return [];
    const set = new Set(drives.map(d => driveDayStr(d)));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [drives]);
  const dayIdx = dayMode ? uniqueDays.indexOf(dayMode) : -1;
  const goPrevDay = () => { if (dayIdx > 0) setDayMode(uniqueDays[dayIdx - 1]); };
  const goNextDay = () => { if (dayIdx >= 0 && dayIdx < uniqueDays.length - 1) setDayMode(uniqueDays[dayIdx + 1]); };

  const uniqueMonths = useMemo(() => {
    if (!drives.length) return [];
    const set = new Set(drives.map(d => driveDayStr(d).slice(0, 7)));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [drives]);
  const monthIdx = monthMode ? uniqueMonths.indexOf(monthMode) : -1;
  const goPrevMonth = () => { if (monthIdx > 0) setMonthMode(uniqueMonths[monthIdx - 1]); };
  const goNextMonth = () => { if (monthIdx >= 0 && monthIdx < uniqueMonths.length - 1) setMonthMode(uniqueMonths[monthIdx + 1]); };

  const uniqueWeeks = useMemo(() => {
    if (!drives.length) return [];
    const set = new Set(drives.map(d => kstMondayStr(`${driveDayStr(d)}T00:00:00Z`)));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [drives]);
  const weekIdx = weekMode ? uniqueWeeks.indexOf(weekMode) : -1;
  const goPrevWeek = () => { if (weekIdx > 0) setWeekMode(uniqueWeeks[weekIdx - 1]); };
  const goNextWeek = () => { if (weekIdx >= 0 && weekIdx < uniqueWeeks.length - 1) setWeekMode(uniqueWeeks[weekIdx + 1]); };

  const goPrev = () => { if (selectedIdx > 0) { setSelectedDrive(drives[selectedIdx - 1]); setSelectedPlace(null); } };
  const goNext = () => { if (selectedIdx < drives.length - 1) { setSelectedDrive(drives[selectedIdx + 1]); setSelectedPlace(null); } };

  return (
    <main className="bg-[#0f0f0f] text-white">
      <div
        className={`max-w-2xl mx-auto flex flex-col ${viewMode === 'list' ? '' : 'overflow-hidden'}`}
        style={viewMode === 'list' ? undefined : { height: 'calc(100dvh - 3.5rem - env(safe-area-inset-bottom, 0px))' }}
      >

      {viewMode === 'list' && (
        <PlacesPanel
          places={places}
          longStayPlaces={longStayPlaces}
          selectedPlace={selectedPlace}
          collapsed={placesCollapsed}
          setCollapsed={setPlacesCollapsed}
          expanded={placesExpanded}
          setExpanded={setPlacesExpanded}
          mode={placesMode}
          setMode={setPlacesMode}
          onSelectPlace={goToPlace}
        />
      )}

      {/* 지도 모드 */}
      {mapEverShown && (
      <div className="flex-1 flex flex-col px-4 pb-4" style={{ display: viewMode === 'map' ? 'flex' : 'none' }}>
          <div className="flex items-center justify-between py-2 mb-2">
            <button onClick={() => setViewMode('list')} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              목록
            </button>
            {monthMode ? (
              <div className="flex items-center gap-3">
                <button onClick={goPrevMonth} disabled={monthIdx <= 0} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <span className="text-xs text-zinc-400 tabular-nums">{monthMode}<span className="text-zinc-600 ml-1">({monthRoutes.length}회)</span></span>
                <button onClick={goNextMonth} disabled={monthIdx < 0 || monthIdx >= uniqueMonths.length - 1} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            ) : weekMode ? (
              <div className="flex items-center gap-3">
                <button onClick={goPrevWeek} disabled={weekIdx <= 0} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <span className="text-xs text-zinc-400 tabular-nums">{(() => {
                  const m = new Date(weekMode + 'T00:00:00Z');
                  const s = new Date(m.getTime() + 6 * 86400000);
                  const fm = m.getUTCMonth() + 1, fd = m.getUTCDate();
                  const lm = s.getUTCMonth() + 1, ld = s.getUTCDate();
                  return fm === lm ? `${fm}/${fd} ~ ${ld}` : `${fm}/${fd} ~ ${lm}/${ld}`;
                })()}<span className="text-zinc-600 ml-1">({weekRoutes.length}회)</span></span>
                <button onClick={goNextWeek} disabled={weekIdx < 0 || weekIdx >= uniqueWeeks.length - 1} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            ) : dayMode ? (
              <div className="flex items-center gap-3">
                <button onClick={goPrevDay} disabled={dayIdx <= 0} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <span className="text-xs text-zinc-400 tabular-nums">{dayMode}<span className="text-zinc-600 ml-1">({dayRoutes.length}회)</span></span>
                <button onClick={goNextDay} disabled={dayIdx < 0 || dayIdx >= uniqueDays.length - 1} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            ) : selectedDrive && (
              <div className="flex items-center gap-3">
                <button onClick={goPrev} disabled={selectedIdx <= 0} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <span className="text-xs text-zinc-600 tabular-nums">{selectedIdx + 1} / {drives.length}</span>
                <button onClick={goNext} disabled={selectedIdx >= drives.length - 1} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 flex flex-col bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden mb-4">
            <MapSummaryHeader
              monthMode={monthMode}
              weekMode={weekMode}
              dayMode={dayMode}
              selectedDrive={selectedDrive}
              selectedPlace={selectedPlace}
              drives={drives}
            />
            {dayMode ? (() => {
              // 리스트 영역 — 모바일(<=768px) 3행 / 데스크톱 5행 고정. 행수 초과 시 내부 스크롤.
              // 높이 = HEADER + N*ITEM + (N-1)*GAP. 지도는 남은 공간 flex-1.
              const ITEM_PX = 50; // py-1.5 + 상단 행(~28px) + 통계 행(~16-22px, wrap 가능)
              const GAP_PX = 22;  // 정차 gap 행: py-1 + text-[10px]
              const HEADER_PX = 24;
              const FIXED_ROWS = isMobile ? 3 : 5; // 모바일(<=768px) 3행, 데스크톱 5행
              const listH = dayRoutes.length > 0 ? HEADER_PX + FIXED_ROWS * ITEM_PX + (FIXED_ROWS - 1) * GAP_PX : 0;
              const scrollable = dayRoutes.length > FIXED_ROWS;
              return (
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="flex-1 min-h-0 p-2">
                    <DriveMap
                      positions={positions}
                      routes={dayRoutes}
                      loading={loadingRoute}
                      placeMarker={selectedPlace}
                      visible={viewMode === 'map'}
                      highlightLatLng={highlightLatLng}
                      highlightRouteId={selectedDayDriveId}
                    />
                  </div>
                  {sparkRoutes.length > 0 && !selectedPlace && (
                    <RouteSparklines routes={sparkRoutes} selectedIdx={selectedPosIdx} onSelect={setSelectedPosIdx} />
                  )}
                  {dayRoutes.length > 0 && (
                    <div className="flex-shrink-0 border-t border-white/[0.06] flex flex-col" style={{ height: `${listH}px` }}>
                      <div className="px-3 py-1 text-[10px] text-zinc-500 font-semibold tracking-wider bg-white/[0.02] flex items-center justify-between flex-shrink-0">
                        <span>그날의 주행 {dayRoutes.length}회</span>
                        {selectedDayDriveId != null && (
                          <button onClick={() => setSelectedDayDriveId(null)} className="text-[10px] text-zinc-400 hover:text-white">전체 보기</button>
                        )}
                      </div>
                      <div className={`flex-1 min-h-0 ${scrollable ? 'overflow-y-auto overscroll-contain' : ''}`}>
                        {dayRoutes.flatMap((r, idx) => {
                          const drive = drives.find(d => d.id === r.id);
                          if (!drive) return [];
                          const prevR = idx > 0 ? dayRoutes[idx - 1] : null;
                          const prevDrive = prevR ? drives.find(d => d.id === prevR.id) : null;
                          const gapMin = (prevDrive?.end_date && drive.start_date)
                            ? Math.round((new Date(drive.start_date) - new Date(prevDrive.end_date)) / 60000)
                            : 0;
                          const label = idx === 0 ? 'S' : idx === dayRoutes.length - 1 ? 'E' : String(idx);
                          const dt = new Date(drive.start_date);
                          const time = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
                          const isSelected = selectedDayDriveId === r.id;
                          const nodes = [];
                          if (gapMin > 0) {
                            nodes.push(
                              <div key={`gap-${r.id}`} className="flex items-center gap-2 px-3 py-1 bg-black/20">
                                <div className="flex-1 h-px bg-white/[0.05]" />
                                <span className="text-[10px] text-zinc-500 tabular-nums">{formatDuration(gapMin)}</span>
                                <div className="flex-1 h-px bg-white/[0.05]" />
                              </div>
                            );
                          }
                          const driveStats = routePosStats(r.positions);
                          nodes.push(
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => setSelectedDayDriveId(prev => prev === r.id ? null : r.id)}
                              className={`w-full text-left block px-3 py-1.5 border-b border-white/[0.04] last:border-0 transition-colors ${
                                isSelected ? 'bg-blue-500/15' : 'hover:bg-white/[0.025] active:bg-blue-500/10'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                                  style={{ backgroundColor: r.color }}
                                >{label}</span>
                                <span className="text-[11px] text-zinc-500 tabular-nums flex-shrink-0">{time}</span>
                                <span className="flex-1 text-xs text-zinc-300 truncate">
                                  {shortAddr(drive.start_address) || '?'}<span className="text-zinc-600 mx-1">→</span>{shortAddr(drive.end_address) || '?'}
                                </span>
                                <span className="text-xs font-bold text-blue-400 tabular-nums flex-shrink-0">
                                  {drive.distance}<span className="text-[10px] text-zinc-600 ml-0.5">km</span>
                                </span>
                              </div>
                              <DriveStatsLine stats={driveStats} />
                            </button>
                          );
                          return nodes;
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })() : (
              <>
                <div className="flex-1 p-2">
                  <DriveMap
                    positions={(monthMode || weekMode) ? [] : positions}
                    routes={monthMode ? monthRoutes : weekMode ? weekRoutes : undefined}
                    loading={loadingRoute}
                    placeMarker={selectedPlace}
                    visible={viewMode === 'map'}
                    highlightLatLng={highlightLatLng}
                  />
                </div>
                {sparkRoutes.length > 0 && !selectedPlace && (
                  <RouteSparklines routes={sparkRoutes} selectedIdx={selectedPosIdx} onSelect={setSelectedPosIdx} />
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 목록 모드 — 카드는 content-fit, 스크롤은 wrapper. 짧은 리스트도 카드 빈 영역 없음. */}
      <div className="px-4 pt-3 pb-3" style={{ display: viewMode === 'list' ? 'block' : 'none' }}>
          <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
            <DriveListView
              drives={drives}
              loadingDrives={loadingDrives}
              error={error}
              onDayClick={goToDay}
              onMonthClick={goToMonth}
              onWeekClick={goToWeek}
              driveDayStr={driveDayStr}
            />
          </div>
        </div>

      </div>
    </main>
  );
}

export default function V2HistoryPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
      </main>
    }>
      <HistoryInner />
    </Suspense>
  );
}
