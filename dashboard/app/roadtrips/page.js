'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMock } from '../context/mock';
import { KWH_PER_KM } from '../../lib/constants';
import { formatDuration, shortAddr } from '../../lib/format';
import DriveMap from '../components/DriveMap';
import DriveListView from './DriveListView';
import { useDriveData } from './useDriveData';

function formatTimeRange(start, end) {
  if (!start) return '—';
  const s = new Date(start);
  const datePart = `${s.getMonth() + 1}/${s.getDate()}`;
  const sTime = `${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`;
  if (!end) return `${datePart} ${sTime}`;
  const e = new Date(end);
  const eTime = `${String(e.getHours()).padStart(2, '0')}:${String(e.getMinutes()).padStart(2, '0')}`;
  return `${datePart} ${sTime}~${eTime}`;
}

function efficiency(d) {
  if (!d.start_rated_range_km || !d.end_rated_range_km || !d.distance) return null;
  const dist = parseFloat(d.distance);
  const usedKm = parseFloat(d.start_rated_range_km) - parseFloat(d.end_rated_range_km);
  if (usedKm <= 0 || !dist || dist === 0) return null;
  const kwh = (usedKm * KWH_PER_KM).toFixed(1);
  const perKm = ((usedKm * KWH_PER_KM * 1000) / dist).toFixed(0); // Wh/km
  return { kwh, perKm };
}

// ── Page Inner ─────────────────────────────────────────────

// 'YYYY-MM-DD' 형식 검증
function isValidDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function DrivesInner() {
  const { isMock, refreshSignal } = useMock();
  const searchParams = useSearchParams();
  const rawId = parseInt(searchParams.get('id') || '');
  const initialId = Number.isFinite(rawId) ? rawId : null;
  const dateParamRaw = searchParams.get('date');
  const initialDate = isValidDateStr(dateParamRaw) ? dateParamRaw : null;

  // 주행의 KST 날짜 문자열 계산 (YYYY-MM-DD)
  const driveDayStr = (d) => {
    const dt = new Date(d.start_date);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  const {
    drives, places,
    selectedDrive, setSelectedDrive,
    positions, setPositions,
    routeData,
    dayMode, setDayMode,
    dayRoutes,
    loadingDrives, loadingRoute,
    error,
  } = useDriveData({ isMock, refreshSignal, initialId, initialDate, driveDayStr });

  const [selectedPlace, setSelectedPlace] = useState(null);
  const [placesExpanded, setPlacesExpanded] = useState(false); // 인라인 세로 리스트 펼침
  const [placesCollapsed, setPlacesCollapsed] = useState(false); // 지도 모드에서 섹션 전체 접힘

  // 목록/지도 모드 — id 또는 date로 진입하면 지도 뷰로 바로
  const entryInMapView = !!initialId || !!initialDate;
  const [viewMode, setViewMode] = useState(entryInMapView ? 'map' : 'list');

  // 지도 모드 진입 시 자주 가는 곳 섹션 자동 접힘, 목록 복귀 시 자동 펼침
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

  const goToDrive = (d) => { setSelectedDrive(d); setSelectedPlace(null); setDayMode(null); setMapEverShown(true); setViewMode('map'); };
  const goToDay = (dateStr) => { setDayMode(dateStr); setSelectedPlace(null); setMapEverShown(true); setViewMode('map'); };

  // 일 모드 날짜 네비 — drives에서 유니크 날짜를 내림차순 정렬 후 dayMode 인덱스 계산
  const uniqueDays = useMemo(() => {
    if (!drives.length) return [];
    const set = new Set(drives.map(d => driveDayStr(d)));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [drives]);
  const dayIdx = dayMode ? uniqueDays.indexOf(dayMode) : -1;
  const goPrevDay = () => { if (dayIdx > 0) setDayMode(uniqueDays[dayIdx - 1]); };
  const goNextDay = () => { if (dayIdx >= 0 && dayIdx < uniqueDays.length - 1) setDayMode(uniqueDays[dayIdx + 1]); };
  const goPrev = () => { if (selectedIdx > 0) { setSelectedDrive(drives[selectedIdx - 1]); setSelectedPlace(null); } };
  const goNext = () => { if (selectedIdx < drives.length - 1) { setSelectedDrive(drives[selectedIdx + 1]); setSelectedPlace(null); } };

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto flex flex-col" style={{ height: 'calc(100dvh - 57px - env(safe-area-inset-bottom, 0px))' }}>

      {/* 자주 방문하는 장소 */}
      {places.length > 0 && (
        <div className="flex-shrink-0 px-4 pt-3 pb-2">
          {placesCollapsed ? (
            // 지도 모드: 얇은 바 (탭하면 펼침)
            <button
              onClick={() => setPlacesCollapsed(false)}
              className="w-full flex items-center justify-between px-3 py-1.5 bg-zinc-800/40 border border-white/[0.06] rounded-lg hover:bg-zinc-800/70 transition-colors"
            >
              <span className="text-xs text-zinc-400">📍 자주 가는 곳 <span className="text-zinc-600 ml-1">· {places.length}개</span></span>
              <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          ) : (
            <>
              {viewMode === 'map' && (
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">자주 가는 곳</span>
                  <button onClick={() => setPlacesCollapsed(true)} className="text-[10px] text-zinc-600 hover:text-zinc-300 px-1.5">접기</button>
                </div>
              )}
              <div className="flex items-stretch gap-2 overflow-x-auto no-scrollbar">
                {places.slice(0, 5).map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedPlace(p); setSelectedDrive(null); setPositions([]); setMapEverShown(true); setViewMode('map'); }}
                    className={`flex-shrink-0 flex flex-col gap-1.5 border rounded-xl px-3 py-3 w-[130px] text-left transition-colors ${
                      selectedPlace?.id === p.id
                        ? 'bg-amber-500/10 border-amber-500/30'
                        : 'bg-zinc-800/60 border-white/[0.06] hover:bg-zinc-800/90'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-600 text-sm font-bold leading-none">#{i + 1}</span>
                      <span className="text-zinc-500 text-xs leading-none">{p.visit_count}회</span>
                    </div>
                    <p className="text-zinc-300 text-xs leading-snug line-clamp-3 flex-1">{p.label || p.city || '—'}</p>
                  </button>
                ))}
                {places.length > 5 && (
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

              {/* 인라인 세로 리스트 — 더보기 클릭 시 펼침 */}
              {placesExpanded && (
                <div className="mt-2 border border-white/[0.06] rounded-xl bg-[#161618] overflow-hidden">
                  <div className="overflow-y-auto" style={{ maxHeight: '40vh' }}>
                    {places.slice(5).map((p, i) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSelectedPlace(p); setSelectedDrive(null); setPositions([]);
                          setPlacesExpanded(false); setMapEverShown(true); setViewMode('map');
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.05] last:border-0 hover:bg-white/[0.03] transition-colors text-left"
                      >
                        <span className="text-sm font-black w-7 text-center flex-shrink-0 text-zinc-600">{i + 6}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-zinc-300 text-sm truncate">{p.label || p.city || '—'}</p>
                          {p.city && p.label !== p.city && <p className="text-zinc-600 text-xs truncate">{p.city}</p>}
                        </div>
                        <span className="text-zinc-400 text-sm tabular-nums flex-shrink-0">{p.visit_count}회</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── 지도 모드 ── */}
      {mapEverShown && (
      <div className="flex-1 flex flex-col px-4 pb-4" style={{ display: viewMode === 'map' ? 'flex' : 'none' }}>
          {/* 상단 네비게이션 */}
          <div className="flex items-center justify-between py-2 mb-2">
            <button onClick={() => setViewMode('list')} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              목록
            </button>
            {dayMode ? (
              <div className="flex items-center gap-3">
                <button onClick={goPrevDay} disabled={dayIdx <= 0}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <span className="text-xs text-zinc-400 tabular-nums">{dayMode}<span className="text-zinc-600 ml-1">({dayRoutes.length}회)</span></span>
                <button onClick={goNextDay} disabled={dayIdx < 0 || dayIdx >= uniqueDays.length - 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            ) : selectedDrive && (
              <div className="flex items-center gap-3">
                <button onClick={goPrev} disabled={selectedIdx <= 0}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <span className="text-xs text-zinc-600 tabular-nums">{selectedIdx + 1} / {drives.length}</span>
                <button onClick={goNext} disabled={selectedIdx >= drives.length - 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            )}
          </div>

          {/* 주행 정보 + 지도 */}
          <div className="flex-1 min-h-0 flex flex-col bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden mb-20">
            {selectedDrive ? (() => {
              const sp = selectedDrive.start_battery_level ?? null;
              const ep = selectedDrive.end_battery_level ?? null;
              return (
              <div className="px-4 py-2 border-b border-white/[0.06] flex items-center gap-3 flex-shrink-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-500 tabular-nums">{formatTimeRange(selectedDrive.start_date, selectedDrive.end_date)} <span className="text-zinc-600">({formatDuration(selectedDrive.duration_min)})</span></p>
                  <p className="text-sm text-zinc-300 truncate">
                    {shortAddr(selectedDrive.start_address) || '출발지'}&nbsp;→&nbsp;{shortAddr(selectedDrive.end_address) || '도착지'}
                  </p>
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
                  {eff && (
                    <p className="text-sm font-semibold text-green-400">
                      {eff.kwh}<span className="text-xs text-zinc-600 ml-0.5">kWh</span>
                      {sp != null && ep != null && sp > ep && (
                        <span className="text-zinc-500 text-xs ml-1">({sp - ep}%)</span>
                      )}
                    </p>
                  )}
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
                  {selectedPlace.first_visit && (
                    <div className="flex justify-between">
                      <span className="text-zinc-600">첫 방문</span>
                      <span className="text-zinc-400 tabular-nums">{(() => { const d = new Date(selectedPlace.first_visit); return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; })()}</span>
                    </div>
                  )}
                  {selectedPlace.last_visit && (
                    <div className="flex justify-between">
                      <span className="text-zinc-600">최근 방문</span>
                      <span className="text-zinc-400 tabular-nums">{(() => { const d = new Date(selectedPlace.last_visit); return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; })()}</span>
                    </div>
                  )}
                  {selectedPlace.avg_distance > 0 && (
                    <div className="flex justify-between">
                      <span className="text-zinc-600">이동 평균</span>
                      <span className="text-blue-400/80 font-semibold tabular-nums">{selectedPlace.avg_distance}km</span>
                    </div>
                  )}
                  {selectedPlace.avg_duration > 0 && (
                    <div className="flex justify-between">
                      <span className="text-zinc-600">소요시간</span>
                      <span className="text-zinc-400 font-semibold tabular-nums">{formatDuration(selectedPlace.avg_duration)}</span>
                    </div>
                  )}
                </div>
                {selectedPlace.origins?.length > 0 && (
                  <div className="flex items-center gap-1 mt-2 pl-5 text-[11px]">
                    <span className="text-zinc-600">주요 출발지</span>
                    {selectedPlace.origins.map((o, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{shortAddr(o.label)}</span>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
            <div className="flex-1 p-2">
              <DriveMap positions={positions} routes={dayMode ? dayRoutes : undefined} loading={loadingRoute} placeMarker={selectedPlace} visible={viewMode === 'map'} />
            </div>
            {selectedDrive && routeData?.speedBands && (
              <div className="px-4 py-2 border-t border-white/[0.04]">
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  {[
                    { key: 'jam',  label: '저속', color: '#ef4444' },
                    { key: 'slow', label: '서행', color: '#f97316' },
                    { key: 'flow', label: '원활', color: '#eab308' },
                    { key: 'fast', label: '빠름', color: '#22c55e' },
                  ].filter(b => routeData.speedBands[b.key] > 0).map(b => (
                    <div key={b.key} className="flex items-center gap-1 text-[11px]">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: b.color }} />
                      <span className="text-zinc-600">{b.label}</span>
                      <span className="font-bold tabular-nums" style={{ color: b.color }}>{routeData.speedBands[b.key]}%</span>
                    </div>
                  ))}
                  {routeData.maxSpeedKmh != null && (
                    <div className="flex items-center gap-1 text-[11px] ml-1 pl-2 border-l border-white/[0.06]">
                      <span className="text-zinc-600">최고</span>
                      <span className="font-bold tabular-nums text-zinc-300">{routeData.maxSpeedKmh}<span className="text-zinc-600 font-normal ml-0.5">km/h</span></span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 목록 모드 ── */}
      <div className="flex-1 flex flex-col px-4 pb-4 pt-3" style={{ display: viewMode === 'list' ? 'flex' : 'none' }}>
          <div className="flex-1 bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 180px)' }}>
              <DriveListView
                drives={drives}
                loadingDrives={loadingDrives}
                error={error}
                onDriveClick={goToDrive}
                onDayClick={goToDay}
                driveDayStr={driveDayStr}
              />
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}

export default function DrivesPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
      </main>
    }>
      <DrivesInner />
    </Suspense>
  );
}
