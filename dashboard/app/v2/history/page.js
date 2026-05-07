'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMock } from '@/app/context/mock';
import { KWH_PER_KM } from '@/lib/constants';
import { formatDuration, formatHm, shortAddr } from '@/lib/format';
import { formatTimeRange, kstDateStr } from '@/lib/kst';
import DriveMap, { loadLeaflet } from '@/app/components/DriveMap';
import RouteSparklines from '@/app/components/RouteSparklines';
import DriveListView from '@/app/v2/history/DriveListView';
import { useDriveData } from '@/app/v2/history/useDriveData';

// 체류 시간 포맷 — 초 단위 → 분/시간/일/주 자동 스케일.
function fmtDwell(sec) {
  if (sec == null) return '—';
  if (sec < 60) return `${Math.floor(sec)}초`;
  if (sec < 3600) return `${Math.floor(sec / 60)}분`;
  if (sec < 86400) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return m === 0 ? `${h}시간` : `${h}h${m}m`;
  }
  if (sec < 7 * 86400) {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    return h === 0 ? `${d}일` : `${d}일 ${h}h`;
  }
  const w = Math.floor(sec / (7 * 86400));
  const d = Math.floor((sec % (7 * 86400)) / 86400);
  return d === 0 ? `${w}주` : `${w}주 ${d}일`;
}

function efficiency(d) {
  if (!d.start_rated_range_km || !d.end_rated_range_km || !d.distance) return null;
  const dist = parseFloat(d.distance);
  const usedKm = parseFloat(d.start_rated_range_km) - parseFloat(d.end_rated_range_km);
  if (usedKm <= 0 || !dist || dist === 0) return null;
  const kwh = (usedKm * KWH_PER_KM).toFixed(1);
  const perKm = ((usedKm * KWH_PER_KM * 1000) / dist).toFixed(0);
  return { kwh, perKm };
}

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

  useEffect(() => {
    const htmlPrev = document.documentElement.style.overflow;
    const bodyPrev = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = htmlPrev;
      document.body.style.overflow = bodyPrev;
    };
  }, []);

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

  const [mapEverShown, setMapEverShown] = useState(entryInMapView);
  const selectedIdx = selectedDrive ? drives.findIndex(d => d.id === selectedDrive.id) : -1;
  const eff = selectedDrive ? efficiency(selectedDrive) : null;

  const [selectedPosIdx, setSelectedPosIdx] = useState(null);
  useEffect(() => { setSelectedPosIdx(null); }, [selectedDrive?.id, dayMode, monthMode]);
  // dayMode 컴팩트 strip 에서 선택된 drive — 지도에서 해당 polyline 만 강조 + zoom.
  const [selectedDayDriveId, setSelectedDayDriveId] = useState(null);
  useEffect(() => { setSelectedDayDriveId(null); }, [dayMode]);

  const sparkRoutes = useMemo(() => {
    if (monthMode && monthRoutes?.length) {
      return monthRoutes.filter(r => r.positions?.length >= 2).map(r => ({ positions: r.positions, startDate: r.startDate, color: r.color }));
    }
    if (dayMode && dayRoutes?.length) {
      return dayRoutes.filter(r => r.positions?.length >= 2).map(r => ({ positions: r.positions, startDate: r.startDate, color: r.color }));
    }
    if (selectedDrive && positions?.length >= 2) {
      return [{ positions, startDate: selectedDrive.start_date, color: '#3b82f6' }];
    }
    return [];
  }, [monthMode, monthRoutes, dayMode, dayRoutes, selectedDrive, positions]);

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

  const goToDay = (dateStr) => { setDayMode(dateStr); setMonthMode(null); setSelectedPlace(null); setMapEverShown(true); setViewMode('map'); };
  const goToMonth = (monthStr) => { setMonthMode(monthStr); setDayMode(null); setSelectedDrive(null); setSelectedPlace(null); setPositions([]); setMapEverShown(true); setViewMode('map'); };

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

  const goPrev = () => { if (selectedIdx > 0) { setSelectedDrive(drives[selectedIdx - 1]); setSelectedPlace(null); } };
  const goNext = () => { if (selectedIdx < drives.length - 1) { setSelectedDrive(drives[selectedIdx + 1]); setSelectedPlace(null); } };

  return (
    <main className="bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto flex flex-col overflow-hidden" style={{ height: 'calc(100dvh - 57px - 58px - env(safe-area-inset-bottom, 0px))' }}>

      {/* 자주 가는 곳 / 오래 머문 곳 — 탭 토글로 메트릭 전환 */}
      {viewMode === 'list' && (places.length > 0 || longStayPlaces.length > 0) && (() => {
        const isLong = placesMode === 'long-stay';
        const displayPlaces = isLong ? longStayPlaces : places;
        if (displayPlaces.length === 0) return null;
        const titleText = isLong ? '🕐 오래 머문 곳' : '📍 자주 가는 곳';
        const titleShort = isLong ? '오래 머문 곳' : '자주 가는 곳';
        const metric = (p) => isLong ? fmtDwell(p.max_dwell_sec) : `${p.visit_count}회`;
        return (
        <div className="flex-shrink-0 px-4 pt-3 pb-2">
          {placesCollapsed ? (
            <button
              onClick={() => setPlacesCollapsed(false)}
              className="w-full flex items-center justify-between px-3 py-1.5 bg-zinc-800/40 border border-white/[0.06] rounded-lg hover:bg-zinc-800/70 transition-colors"
            >
              <span className="text-xs text-zinc-400">{titleText} <span className="text-zinc-600 ml-1">· {displayPlaces.length}개</span></span>
              <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          ) : (
            <>
              {/* 토글 헤더 — list/map 양쪽 모드 모두 노출. 접기 버튼은 map 모드에만. */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 bg-zinc-800/40 border border-white/[0.06] rounded-lg p-0.5">
                  <button
                    onClick={() => { setPlacesMode('frequent'); setPlacesExpanded(false); }}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors ${
                      !isLong ? 'text-zinc-100 bg-white/[0.10]' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >📍 자주 가는 곳</button>
                  <button
                    onClick={() => { setPlacesMode('long-stay'); setPlacesExpanded(false); }}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors ${
                      isLong ? 'text-zinc-100 bg-white/[0.10]' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >🕐 오래 머문 곳</button>
                </div>
                {viewMode === 'map' && (
                  <button onClick={() => setPlacesCollapsed(true)} className="text-[10px] text-zinc-600 hover:text-zinc-300 px-1.5">접기</button>
                )}
              </div>
              <div className="flex items-stretch gap-2 overflow-x-auto no-scrollbar">
                {displayPlaces.slice(0, 5).map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedPlace(p); setSelectedDrive(null); setPositions([]); setMonthMode(null); setMapEverShown(true); setViewMode('map'); }}
                    className={`flex-shrink-0 flex flex-col gap-1.5 border rounded-xl px-3 py-3 w-[130px] text-left transition-colors ${
                      selectedPlace?.id === p.id
                        ? 'bg-amber-500/10 border-amber-500/30'
                        : 'bg-zinc-800/60 border-white/[0.06] hover:bg-zinc-800/90'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-600 text-sm font-bold leading-none">#{i + 1}</span>
                      <span className="text-zinc-500 text-xs leading-none tabular-nums">{metric(p)}</span>
                    </div>
                    <p className="text-zinc-300 text-xs leading-snug line-clamp-3 flex-1">{p.label || p.city || '—'}</p>
                  </button>
                ))}
                {displayPlaces.length > 5 && (
                  <button
                    onClick={() => setPlacesExpanded(v => !v)}
                    className={`flex-shrink-0 flex flex-col items-center justify-center gap-1 border rounded-xl px-3 py-3 w-[64px] transition-colors ${
                      placesExpanded
                        ? 'bg-blue-500/15 border-blue-500/30'
                        : 'bg-zinc-800/40 border-white/[0.06] hover:bg-zinc-800/70'
                    }`}
                  >
                    <span className={`text-lg font-bold leading-none ${placesExpanded ? 'text-blue-300' : 'text-zinc-400'}`}>{placesExpanded ? '×' : '···'}</span>
                    <span className={`text-xs ${placesExpanded ? 'text-blue-300' : 'text-zinc-500'}`}>{placesExpanded ? '접기' : '더보기'}</span>
                  </button>
                )}
              </div>
              {placesExpanded && (
                <div className="mt-2 border border-white/[0.06] rounded-xl bg-[#161618] overflow-hidden">
                  <div className="overflow-y-auto" style={{ maxHeight: '40vh' }}>
                    {displayPlaces.slice(5).map((p, i) => (
                      <button
                        key={p.id}
                        onClick={() => { setSelectedPlace(p); setSelectedDrive(null); setPositions([]); setMonthMode(null); setPlacesExpanded(false); setMapEverShown(true); setViewMode('map'); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.05] last:border-0 hover:bg-white/[0.03] transition-colors text-left"
                      >
                        <span className="text-sm font-black w-7 text-center flex-shrink-0 text-zinc-600">{i + 6}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-zinc-300 text-sm truncate">{p.label || p.city || '—'}</p>
                          {p.city && p.label !== p.city && <p className="text-zinc-600 text-xs truncate">{p.city}</p>}
                        </div>
                        <span className="text-zinc-400 text-sm tabular-nums flex-shrink-0">{metric(p)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        );
      })()}

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
            {monthMode ? (() => {
              const mDrives = drives.filter(d => driveDayStr(d).slice(0, 7) === monthMode).slice().sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
              if (mDrives.length === 0) return null;
              const totalKm = mDrives.reduce((s, d) => s + (parseFloat(d.distance) || 0), 0);
              const totalMin = mDrives.reduce((s, d) => s + (parseFloat(d.duration_min) || 0), 0);
              const totalKwh = mDrives.reduce((s, d) => {
                if (d.start_rated_range_km && d.end_rated_range_km) {
                  const usedKm = parseFloat(d.start_rated_range_km) - parseFloat(d.end_rated_range_km);
                  if (usedKm > 0) return s + usedKm * KWH_PER_KM;
                }
                return s;
              }, 0);
              const usedPct = mDrives.reduce((s, d) => (d.start_battery_level != null && d.end_battery_level != null) ? s + Math.max(0, d.start_battery_level - d.end_battery_level) : s, 0);
              const perKm = totalKm > 0 && totalKwh > 0 ? Math.round((totalKwh * 1000) / totalKm) : null;
              const dayCount = new Set(mDrives.map(d => driveDayStr(d))).size;
              const destMap = new Map();
              const SKIP_DESTS = new Set(['집', '회사']);
              for (const d of mDrives) {
                const key = shortAddr(d.end_address) || '?';
                if (SKIP_DESTS.has(key)) continue;
                destMap.set(key, (destMap.get(key) || 0) + 1);
              }
              const topDests = Array.from(destMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
              const monthLabel = (() => {
                const [y, mm] = monthMode.split('-');
                const cy = new Date().getFullYear();
                return parseInt(y) === cy ? `${parseInt(mm)}월` : `${y}년 ${parseInt(mm)}월`;
              })();
              return (
                <div className="px-4 py-1.5 border-b border-white/[0.06] flex flex-col gap-0.5 flex-shrink-0">
                  <p className="text-sm text-zinc-500 tabular-nums flex items-center gap-1.5 flex-wrap">
                    <span className="text-zinc-300 font-semibold">{monthLabel}</span>
                    <span className="text-zinc-700">·</span>
                    <span title="주행"><span className="mr-0.5">🚗</span>{mDrives.length}회</span>
                    <span className="text-zinc-700">·</span>
                    <span title="운행일"><span className="mr-0.5">📅</span>{dayCount}일</span>
                    {totalMin > 0 && (
                      <>
                        <span className="text-zinc-700">·</span>
                        <span title="운전"><span className="mr-0.5">🛣️</span>{formatHm(Math.round(totalMin))}</span>
                      </>
                    )}
                  </p>
                  <p className="text-xs tabular-nums flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-blue-400">{totalKm.toFixed(0)}<span className="text-zinc-600 ml-0.5">km</span></span>
                    {totalKwh > 0 && (
                      <>
                        <span className="text-zinc-700">·</span>
                        <span className="font-semibold text-green-400">{totalKwh.toFixed(1)}<span className="text-zinc-600 ml-0.5">kWh</span>{usedPct > 0 && <span className="text-zinc-500 ml-1">({usedPct}%)</span>}</span>
                      </>
                    )}
                    {perKm != null && (
                      <>
                        <span className="text-zinc-700">·</span>
                        <span className="text-amber-400">{perKm}<span className="text-zinc-600 ml-0.5">Wh/km</span></span>
                      </>
                    )}
                  </p>
                  {topDests.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                      <span className="flex-shrink-0">⭐</span>
                      {topDests.map(([addr, n], i) => (
                        <span key={addr} className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 truncate max-w-[140px]">
                          <span className="text-zinc-600 mr-1">{i + 1}</span>{addr}<span className="text-zinc-500 ml-1 tabular-nums">{n}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })() : dayMode ? (() => {
              const dayDrives = drives.filter(d => driveDayStr(d) === dayMode).slice().sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
              if (dayDrives.length === 0) return null;
              const first = dayDrives[0]; const last = dayDrives[dayDrives.length - 1];
              const totalKm = dayDrives.reduce((s, d) => s + (parseFloat(d.distance) || 0), 0);
              const totalMin = dayDrives.reduce((s, d) => s + (parseFloat(d.duration_min) || 0), 0);
              const totalKwh = dayDrives.reduce((s, d) => {
                if (d.start_rated_range_km && d.end_rated_range_km) { const usedKm = parseFloat(d.start_rated_range_km) - parseFloat(d.end_rated_range_km); if (usedKm > 0) return s + usedKm * KWH_PER_KM; }
                return s;
              }, 0);
              const usedPct = dayDrives.reduce((s, d) => (d.start_battery_level != null && d.end_battery_level != null) ? s + Math.max(0, d.start_battery_level - d.end_battery_level) : s, 0);
              const perKm = totalKm > 0 && totalKwh > 0 ? Math.round((totalKwh * 1000) / totalKm) : null;
              let stayMin = 0;
              for (let i = 1; i < dayDrives.length; i++) {
                const prev = dayDrives[i - 1];
                const cur = dayDrives[i];
                if (prev.end_date && cur.start_date) {
                  const gap = (new Date(cur.start_date) - new Date(prev.end_date)) / 60000;
                  if (gap > 0) stayMin += gap;
                }
              }
              return (
                <>
                <div className="px-4 py-1.5 border-b border-white/[0.06] flex flex-col gap-0.5 flex-shrink-0">
                  <p className="text-sm text-zinc-500 tabular-nums flex items-center gap-1.5 flex-wrap">
                    <span>{formatTimeRange(first.start_date, last.end_date)}</span>
                    <span className="text-zinc-700">·</span>
                    <span title="주행"><span className="mr-0.5">🚗</span>{dayDrives.length}회</span>
                    {totalMin > 0 && (
                      <>
                        <span className="text-zinc-700">·</span>
                        <span title="운전"><span className="mr-0.5">🛣️</span>{formatHm(Math.round(totalMin))}</span>
                      </>
                    )}
                    {stayMin > 0 && (
                      <>
                        <span className="text-zinc-700">·</span>
                        <span title="정차"><span className="mr-0.5">🅿️</span>{formatHm(Math.round(stayMin))}</span>
                      </>
                    )}
                  </p>
                  <p className="text-sm text-zinc-300 leading-snug truncate">
                    {(() => {
                      const raw = [first.start_address, ...dayDrives.map(d => d.end_address)].map(a => shortAddr(a) || '?');
                      const chain = [];
                      for (const addr of raw) { if (chain.length === 0 || chain[chain.length - 1] !== addr) chain.push(addr); }
                      return chain.map((addr, i) => <span key={i}>{i > 0 && <span className="text-zinc-600 mx-1">→</span>}{addr}</span>);
                    })()}
                  </p>
                  <p className="text-xs tabular-nums flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-blue-400">{totalKm.toFixed(1)}<span className="text-zinc-600 ml-0.5">km</span></span>
                    {totalKwh > 0 && (
                      <>
                        <span className="text-zinc-700">·</span>
                        <span className="font-semibold text-green-400">{totalKwh.toFixed(1)}<span className="text-zinc-600 ml-0.5">kWh</span>{usedPct > 0 && <span className="text-zinc-500 ml-1">({usedPct}%)</span>}</span>
                      </>
                    )}
                    {perKm != null && (
                      <>
                        <span className="text-zinc-700">·</span>
                        <span className="text-amber-400">{perKm}<span className="text-zinc-600 ml-0.5">Wh/km</span></span>
                      </>
                    )}
                  </p>
                </div>
                </>
              );
            })() : selectedDrive ? (() => {
              const sp = selectedDrive.start_battery_level ?? null;
              const ep = selectedDrive.end_battery_level ?? null;
              return (
                <div className="px-4 py-2 border-b border-white/[0.06] flex items-center gap-3 flex-shrink-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-500 tabular-nums">{formatTimeRange(selectedDrive.start_date, selectedDrive.end_date)} <span className="text-zinc-600">({formatDuration(selectedDrive.duration_min)})</span></p>
                    <p className="text-sm text-zinc-300 truncate">{shortAddr(selectedDrive.start_address) || '출발지'}&nbsp;→&nbsp;{shortAddr(selectedDrive.end_address) || '도착지'}</p>
                    {sp != null && ep != null && (
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-zinc-500 tabular-nums">
                        <div className="w-20 h-1.5 bg-zinc-800 rounded-sm overflow-hidden relative">
                          <div className="absolute inset-y-0 rounded-sm bg-blue-400/30" style={{ left: `${ep}%`, width: `${sp - ep}%` }} />
                          <div className="absolute inset-y-0 rounded-sm bg-green-400/40" style={{ left: 0, width: `${ep}%` }} />
                        </div>
                        <span>{sp}<span className="text-zinc-600">{'>'}</span>{ep}%</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-right tabular-nums">
                    <p className="text-sm font-bold text-blue-400">{selectedDrive.distance}<span className="text-xs text-zinc-600 ml-0.5">km</span></p>
                    {eff && <p className="text-sm font-semibold text-green-400">{eff.kwh}<span className="text-xs text-zinc-600 ml-0.5">kWh</span>{sp != null && ep != null && sp > ep && <span className="text-zinc-500 text-xs ml-1">({sp - ep}%)</span>}</p>}
                    {eff && <p className="text-xs text-amber-400">{eff.perKm}<span className="text-zinc-600 ml-0.5">Wh/km</span></p>}
                  </div>
                </div>
              );
            })() : selectedPlace ? (
              <div className="px-4 py-2.5 border-b border-white/[0.06] flex-shrink-0">
                <div className="flex items-center gap-3 mb-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0" />
                  <p className="text-base text-zinc-300 truncate flex-1">{selectedPlace.label}</p>
                  <span className="text-amber-400 text-sm font-bold tabular-nums flex-shrink-0">{selectedPlace.visit_count}회 방문</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pl-5 text-xs">
                  {selectedPlace.first_visit && <div className="flex justify-between"><span className="text-zinc-600">첫 방문</span><span className="text-zinc-400 tabular-nums">{(() => { const d = new Date(selectedPlace.first_visit); return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; })()}</span></div>}
                  {selectedPlace.last_visit && <div className="flex justify-between"><span className="text-zinc-600">최근 방문</span><span className="text-zinc-400 tabular-nums">{(() => { const d = new Date(selectedPlace.last_visit); return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; })()}</span></div>}
                  {selectedPlace.avg_distance > 0 && <div className="flex justify-between"><span className="text-zinc-600">이동 평균</span><span className="text-blue-400/80 font-semibold tabular-nums">{selectedPlace.avg_distance}km</span></div>}
                  {selectedPlace.avg_duration > 0 && <div className="flex justify-between"><span className="text-zinc-600">소요시간</span><span className="text-zinc-400 font-semibold tabular-nums">{formatDuration(selectedPlace.avg_duration)}</span></div>}
                </div>
                {selectedPlace.origins?.length > 0 && (
                  <div className="flex items-center gap-1 mt-2 pl-5 text-[11px]">
                    <span className="text-zinc-600">주요 출발지</span>
                    {selectedPlace.origins.map((o, i) => <span key={i} className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{shortAddr(o.label)}</span>)}
                  </div>
                )}
              </div>
            ) : null}
            {dayMode ? (() => {
              // 리스트 영역 — 모바일(<=768px) 3행 / 데스크톱 5행 고정. 행수 초과 시 내부 스크롤.
              // 높이 = HEADER + N*ITEM + (N-1)*GAP. 지도는 남은 공간 flex-1.
              const ITEM_PX = 32; // py-1.5 + 배지 w-5(20px) → 32px
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
                          nodes.push(
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => setSelectedDayDriveId(prev => prev === r.id ? null : r.id)}
                              className={`w-full text-left flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.04] last:border-0 transition-colors ${
                                isSelected ? 'bg-blue-500/15' : 'hover:bg-white/[0.025] active:bg-blue-500/10'
                              }`}
                            >
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
                    positions={monthMode ? [] : positions}
                    routes={monthMode ? monthRoutes : undefined}
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

      {/* 목록 모드 */}
      <div className="flex-1 min-h-0 flex flex-col px-4 pb-4 pt-3" style={{ display: viewMode === 'list' ? 'flex' : 'none' }}>
          <div className="flex-1 min-h-0 bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="h-full overflow-y-auto">
              <DriveListView
                drives={drives}
                loadingDrives={loadingDrives}
                error={error}
                onDayClick={goToDay}
                onMonthClick={goToMonth}
                driveDayStr={driveDayStr}
              />
            </div>
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
