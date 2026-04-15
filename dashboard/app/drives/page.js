'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMock, MOCK_DATA } from '../context/mock';
import { KWH_PER_KM } from '../../lib/constants';
import { formatDuration, shortAddr } from '../../lib/format';

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

// ── Leaflet Map (CDN) ─────────────────────────────────────────

// Module-level queue prevents double-script when called concurrently
let _leafletLoading = false;
const _leafletQueue = [];

function loadLeaflet(cb) {
  if (window.L) { cb(); return; }
  _leafletQueue.push(cb);
  if (_leafletLoading) return;
  _leafletLoading = true;
  if (!document.querySelector('link[href*="leaflet"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  script.onload = () => {
    _leafletLoading = false;
    _leafletQueue.splice(0).forEach(f => f());
  };
  document.head.appendChild(script);
}

function DriveMap({ positions, loading, placeMarker, visible }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const polyRef = useRef(null);
  const markersRef = useRef([]);
  const placeMarkerRef = useRef(null);

  const initMap = useCallback(() => {
    if (!containerRef.current || mapInstanceRef.current || !window.L) return;
    const L = window.L;
    mapInstanceRef.current = L.map(containerRef.current, {
      zoomControl: true, attributionControl: false,
    }).setView([37.5665, 126.9780], 11);
    mapRef.current = mapInstanceRef.current;
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(mapInstanceRef.current);
  }, []);

  const drawContent = useCallback(() => {
    const map = mapRef.current;
    const L = window.L;
    if (!map || !L) return;
    if (polyRef.current) { map.removeLayer(polyRef.current); polyRef.current = null; }
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];
    if (placeMarkerRef.current) { map.removeLayer(placeMarkerRef.current); placeMarkerRef.current = null; }

    if (placeMarker?.lat && placeMarker?.lng) {
      placeMarkerRef.current = L.circleMarker([placeMarker.lat, placeMarker.lng], {
        radius: 12, fillColor: '#f59e0b', color: '#fff', weight: 2, fillOpacity: 0.9,
      }).addTo(map);
      map.flyTo([placeMarker.lat, placeMarker.lng], 14, { animate: true, duration: 0.8 });
      return;
    }

    if (!positions || positions.length < 2) return;
    const latlngs = positions.map(p => [p.lat, p.lng]);
    const hasSpeed = positions.some(p => p.speed != null);

    if (hasSpeed) {
      // 속도별 구간 색상 — ~15개 청크로 분할
      const CHUNKS = Math.min(15, Math.ceil(positions.length / 3));
      const chunkSize = Math.ceil(positions.length / CHUNKS);
      const speedColor = (spd) => {
        if (spd <= 30) return '#ef4444';   // 정체 — 빨강
        if (spd <= 60) return '#f97316';   // 서행 — 주황
        if (spd <= 80) return '#eab308';   // 원활 — 노랑
        return '#22c55e';                   // 빠름 — 초록
      };
      const group = L.layerGroup().addTo(map);
      for (let i = 0; i < CHUNKS; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize + 1, positions.length);
        const segment = positions.slice(start, end);
        if (segment.length < 2) continue;
        const avgSpd = segment.reduce((s, p) => s + (p.speed || 0), 0) / segment.length;
        const segLatLngs = segment.map(p => [p.lat, p.lng]);
        L.polyline(segLatLngs, { color: speedColor(avgSpd), weight: 5, opacity: 0.85 }).addTo(group);
      }
      polyRef.current = group;
    } else {
      polyRef.current = L.polyline(latlngs, { color: '#3b82f6', weight: 5, opacity: 0.85 }).addTo(map);
    }

    const mkStart = L.circleMarker(latlngs[0], { radius: 7, fillColor: '#22c55e', color: '#fff', weight: 2, fillOpacity: 1 }).addTo(map);
    const mkEnd = L.circleMarker(latlngs[latlngs.length - 1], { radius: 7, fillColor: '#ef4444', color: '#fff', weight: 2, fillOpacity: 1 }).addTo(map);
    markersRef.current = [mkStart, mkEnd];
    map.fitBounds(L.latLngBounds(latlngs), { padding: [50, 50] });
  }, [positions, placeMarker]);

  // Keep a ref to the latest drawContent so init callback always calls current version
  const drawContentRef = useRef(drawContent);
  useEffect(() => { drawContentRef.current = drawContent; }, [drawContent]);

  // Init map once on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    loadLeaflet(() => {
      initMap();
      drawContentRef.current();
      setTimeout(() => mapInstanceRef.current?.invalidateSize(), 150);
    });
    return () => {
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw when positions / placeMarker change
  useEffect(() => {
    if (!mapRef.current || !window.L) return;
    drawContent();
  }, [drawContent]);

  // Resize when tab becomes visible
  useEffect(() => {
    if (visible && mapInstanceRef.current) {
      setTimeout(() => mapInstanceRef.current?.invalidateSize(), 150);
    }
  }, [visible]);

  return (
    <div className="relative w-full h-full">
      <style>{`
        .leaflet-container { background: #111 !important; }
        .leaflet-control-zoom a { background: #1a1a1a !important; color: #fff !important; border-color: #333 !important; }
        .leaflet-control-zoom a:hover { background: #2a2a2a !important; }
      `}</style>
      <div ref={containerRef} className="w-full h-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl">
          <div className="w-6 h-6 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
        </div>
      )}
      {!loading && !placeMarker && (!positions || positions.length < 2) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 pointer-events-none">
          <svg className="w-12 h-12 mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <p className="text-sm">경로 데이터가 없습니다</p>
        </div>
      )}
    </div>
  );
}

// ── Page Inner ─────────────────────────────────────────────

function DrivesInner() {
  const { isMock, refreshSignal } = useMock();
  const searchParams = useSearchParams();
  const rawId = parseInt(searchParams.get('id') || '');
  const initialId = Number.isFinite(rawId) ? rawId : null;

  const [drives, setDrives] = useState([]);
  const [selectedDrive, setSelectedDrive] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [positions, setPositions] = useState([]);
  const [places, setPlaces] = useState([]);
  const [showAllPlaces, setShowAllPlaces] = useState(false);
  const [routeData, setRouteData] = useState(null);
  const [loadingDrives, setLoadingDrives] = useState(true);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (isMock) {
      const list = MOCK_DATA.drives.recent_drives;
      setDrives(list);
      setPlaces(MOCK_DATA.frequentPlaces);
      setLoadingDrives(false);
      const preselect = initialId ? list.find(d => d.id === initialId) : null;
      setSelectedDrive(preselect || list[0]);
      return;
    }
    setLoadingDrives(true);
    setError(null);
    Promise.allSettled([
      fetch('/api/drives').then(r => r.json()),
      fetch('/api/frequent-places').then(r => r.json()),
    ]).then(([drivesResult, placesResult]) => {
      const drivesData = drivesResult.status === 'fulfilled' ? drivesResult.value : { recent_drives: [] };
      const placesData = placesResult.status === 'fulfilled' ? placesResult.value : { places: [] };
      if (drivesResult.status === 'rejected') setError('데이터를 불러오지 못했습니다.');
      const list = drivesData.recent_drives || [];
      setDrives(list);
      setPlaces(placesData.places || []);
      setLoadingDrives(false);
      if (list.length > 0) {
        const preselect = initialId ? list.find(d => d.id === initialId) : null;
        setSelectedDrive(preselect || list[0]);
      }
    });
  }, [isMock, refreshSignal, initialId]);

  useEffect(() => {
    if (!selectedDrive) return;
    if (isMock) {
      setPositions(MOCK_DATA.routePositions);
      setRouteData({ positions: MOCK_DATA.routePositions, maxSpeedKmh: 127, speedBands: { jam: 12, slow: 35, flow: 28, fast: 25 } });
      return;
    }
    setLoadingRoute(true);
    setPositions([]);
    setRouteData(null);
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    fetch(`/api/route-map?driveId=${selectedDrive.id}`, { signal: abortRef.current.signal })
      .then(r => r.json())
      .then(data => {
        setPositions(data.positions || []);
        setRouteData(data);
        setLoadingRoute(false);
      })
      .catch(e => {
        if (e.name !== 'AbortError') {
          setPositions([]);
          setRouteData(null);
          setLoadingRoute(false);
        }
      });
  }, [selectedDrive?.id, isMock, refreshSignal]);

  // 목록/지도 모드
  const [viewMode, setViewMode] = useState(initialId ? 'map' : 'list');
  const [mapEverShown, setMapEverShown] = useState(!!initialId);
  const selectedIdx = selectedDrive ? drives.findIndex(d => d.id === selectedDrive.id) : -1;
  const eff = selectedDrive ? efficiency(selectedDrive) : null;

  const goToDrive = (d) => { setSelectedDrive(d); setSelectedPlace(null); setMapEverShown(true); setViewMode('map'); };
  const goPrev = () => { if (selectedIdx > 0) { setSelectedDrive(drives[selectedIdx - 1]); setSelectedPlace(null); } };
  const goNext = () => { if (selectedIdx < drives.length - 1) { setSelectedDrive(drives[selectedIdx + 1]); setSelectedPlace(null); } };

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto flex flex-col" style={{ height: 'calc(100dvh - 57px - env(safe-area-inset-bottom, 0px))' }}>

      {/* 자주 방문하는 장소 */}
      {places.length > 0 && (
        <div className="flex-shrink-0 px-4 pt-4 pb-3">
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
                onClick={() => setShowAllPlaces(true)}
                className="flex-shrink-0 flex flex-col items-center justify-center gap-1 border border-white/[0.06] rounded-xl px-3 py-3 w-[64px] bg-zinc-800/40 hover:bg-zinc-800/70 transition-colors"
              >
                <span className="text-zinc-400 text-lg font-bold leading-none">···</span>
                <span className="text-zinc-500 text-xs">더보기</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 자주 가는 곳 전체 랭킹 모달 */}
      {showAllPlaces && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => setShowAllPlaces(false)}>
          <div className="w-full max-w-2xl bg-[#161618] border border-white/[0.08] rounded-t-2xl pb-safe" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/[0.06]">
              <span className="text-sm font-bold text-zinc-300">자주 가는 곳 랭킹</span>
              <button onClick={() => setShowAllPlaces(false)} className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-zinc-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: '60vh' }}>
              {places.map((p, i) => (
                <button key={p.id} onClick={() => { setSelectedPlace(p); setSelectedDrive(null); setPositions([]); setShowAllPlaces(false); setViewMode('map'); }}
                  className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] last:border-0 hover:bg-white/[0.03] transition-colors text-left">
                  <span className={`text-sm font-black w-7 text-center flex-shrink-0 ${i < 3 ? 'text-amber-400' : 'text-zinc-600'}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-300 text-sm truncate">{p.label || p.city || '—'}</p>
                    {p.city && p.label !== p.city && <p className="text-zinc-600 text-xs truncate">{p.city}</p>}
                  </div>
                  <span className="text-zinc-400 text-sm tabular-nums flex-shrink-0">{p.visit_count}회</span>
                </button>
              ))}
            </div>
            <div className="h-6" />
          </div>
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
            {selectedDrive && (
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
                  {eff && <p className="text-sm font-semibold text-green-400">{eff.kwh}<span className="text-xs text-zinc-600 ml-0.5">kWh</span></p>}
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
              <DriveMap positions={positions} loading={loadingRoute} placeMarker={selectedPlace} visible={viewMode === 'map'} />
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
              {loadingDrives ? (
                <div className="flex items-center justify-center h-24">
                  <div className="w-6 h-6 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
                </div>
              ) : error ? (
                <p className="text-red-400 text-sm text-center py-4">{error}</p>
              ) : !drives.length ? (
                <p className="text-zinc-500 text-sm text-center py-4">주행 기록이 없습니다</p>
              ) : (
                drives.map((d, idx) => {
                  const eff = efficiency(d);
                  const dt = new Date(d.start_date);
                  const dateLabel = `${dt.getMonth()+1}/${dt.getDate()}`;
                  const timeLabel = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
                  const startPct = d.start_battery_level ?? null;
                  const endPct = d.end_battery_level ?? null;
                  const usedPct = (startPct != null && endPct != null) ? Math.max(0, startPct - endPct) : 0;

                  // 날짜 구분선
                  const prevDt = idx > 0 ? new Date(drives[idx - 1].start_date) : null;
                  const showDateHeader = !prevDt || dt.toDateString() !== prevDt.toDateString();

                  // 대기 시간
                  let gapLabel = null;
                  if (idx < drives.length - 1 && d.start_date && drives[idx + 1].end_date) {
                    const gapMs = new Date(d.start_date) - new Date(drives[idx + 1].end_date);
                    if (gapMs > 0) {
                      const gapMin = Math.round(gapMs / 60000);
                      gapLabel = formatDuration(gapMin);
                    }
                  }

                  return (
                    <div key={d.id}>
                      {showDateHeader && (
                        <div className="px-4 py-2 bg-white/[0.02] border-b border-white/[0.06]">
                          <span className="text-[11px] font-bold text-zinc-500">{dt.getMonth()+1}월 {dt.getDate()}일</span>
                        </div>
                      )}
                      <button
                        onClick={() => goToDrive(d)}
                        className="w-full text-left grid grid-cols-[52px_1fr_auto] items-center gap-2 px-4 py-3 border-b border-white/[0.06] last:border-0 hover:bg-white/[0.025] active:bg-blue-500/10 transition-all"
                      >
                        <div className="text-xs text-zinc-500 tabular-nums leading-tight">
                          <p>{timeLabel}</p>
                          {d.end_date && <p>{`${String(new Date(d.end_date).getHours()).padStart(2,'0')}:${String(new Date(d.end_date).getMinutes()).padStart(2,'0')}`}</p>}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-zinc-300 truncate">
                            {shortAddr(d.start_address) || '?'}<span className="text-zinc-600 mx-1">→</span>{shortAddr(d.end_address) || '?'}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-zinc-600 tabular-nums">{formatDuration(d.duration_min)}</span>
                            {startPct != null && endPct != null && (
                              <div className="flex items-center gap-1 text-xs text-zinc-500 tabular-nums">
                                <div className="w-20 h-1.5 bg-zinc-800 rounded-sm overflow-hidden relative">
                                  <div className="absolute inset-y-0 rounded-sm bg-blue-400/30" style={{ left: `${endPct}%`, width: `${startPct - endPct}%` }} />
                                  <div className="absolute inset-y-0 rounded-sm bg-green-400/40" style={{ left: 0, width: `${endPct}%` }} />
                                </div>
                                <span>{startPct}<span className="text-zinc-600">{'>'}</span>{endPct}%</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-blue-400 tabular-nums">{d.distance}<span className="text-xs font-medium text-zinc-600 ml-0.5">km</span></p>
                          {eff && (
                            <p className="text-xs text-green-400/80 tabular-nums">
                              {eff.kwh}<span className="ml-0.5">kWh</span>
                              {usedPct > 0 && <span className="text-zinc-500 ml-1">({usedPct}%)</span>}
                            </p>
                          )}
                        </div>
                      </button>
                      {gapLabel && (
                        <div className="flex items-center gap-2 px-4 py-0.5 bg-[#111]">
                          <div className="flex-1 h-px bg-white/[0.04]" />
                          <span className="text-xs text-zinc-600 tabular-nums">{gapLabel}</span>
                          <div className="flex-1 h-px bg-white/[0.04]" />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
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
