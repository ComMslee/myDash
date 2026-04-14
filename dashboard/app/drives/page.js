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

function loadLeaflet(cb) {
  if (window.L) { cb(); return; }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  script.onload = cb;
  document.head.appendChild(script);
}

function DriveMap({ positions, loading, placeMarker }) {
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    loadLeaflet(initMap);
    return () => {
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      mapRef.current = null;
    };
  }, [initMap]);

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
    polyRef.current = L.polyline(latlngs, { color: '#3b82f6', weight: 5, opacity: 0.85 }).addTo(map);
    const mkStart = L.circleMarker(latlngs[0], { radius: 7, fillColor: '#22c55e', color: '#fff', weight: 2, fillOpacity: 1 }).addTo(map);
    const mkEnd = L.circleMarker(latlngs[latlngs.length - 1], { radius: 7, fillColor: '#ef4444', color: '#fff', weight: 2, fillOpacity: 1 }).addTo(map);
    markersRef.current = [mkStart, mkEnd];
    map.fitBounds(polyRef.current.getBounds(), { padding: [40, 40] });
  }, [positions, placeMarker]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    let attempts = 0;
    const tryDraw = () => {
      if (cancelled || attempts > 50) return;
      attempts++;
      (window.L && mapRef.current) ? drawContent() : setTimeout(tryDraw, 200);
    };
    tryDraw();
    return () => { cancelled = true; };
  }, [drawContent]);

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
      return;
    }
    setLoadingRoute(true);
    setPositions([]);
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    fetch(`/api/route-map?driveId=${selectedDrive.id}`, { signal: abortRef.current.signal })
      .then(r => r.json())
      .then(data => {
        setPositions(data.positions || []);
        setLoadingRoute(false);
      })
      .catch(e => {
        if (e.name !== 'AbortError') {
          setPositions([]);
          setLoadingRoute(false);
        }
      });
  }, [selectedDrive?.id, isMock, refreshSignal]);

  const eff = selectedDrive ? efficiency(selectedDrive) : null;

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto flex flex-col" style={{ minHeight: 'calc(100vh - 57px)' }}>

      {/* 자주 방문하는 장소 (좌우 스크롤, 최대 5개 + 더보기) */}
      {places.length > 0 && (
        <div className="flex-shrink-0 px-4 pt-3 pb-2">
          <div className="flex items-stretch gap-2 overflow-x-auto no-scrollbar">
            {places.slice(0, 5).map((p, i) => (
              <button
                key={p.id}
                onClick={() => { setSelectedPlace(p); setSelectedDrive(null); setPositions([]); }}
                className={`flex-shrink-0 flex items-start gap-2 border rounded-xl px-3 py-2 w-[170px] text-left transition-colors ${
                  selectedPlace?.id === p.id
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : 'bg-zinc-800/60 border-white/[0.06] hover:bg-zinc-800/90'
                }`}
              >
                <span className="text-zinc-600 text-sm font-bold mt-0.5">#{i + 1}</span>
                <p className="text-zinc-300 text-xs leading-snug flex-1 line-clamp-2">{p.label || p.city || '—'}</p>
                <span className="text-zinc-500 text-xs flex-shrink-0 mt-0.5">{p.visit_count}회</span>
              </button>
            ))}
            {places.length > 5 && (
              <button
                onClick={() => setShowAllPlaces(true)}
                className="flex-shrink-0 flex flex-col items-center justify-center gap-1 border border-white/[0.06] rounded-xl px-3 py-2 w-[80px] bg-zinc-800/40 hover:bg-zinc-800/70 transition-colors"
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
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
          onClick={() => setShowAllPlaces(false)}
        >
          <div
            className="w-full max-w-2xl bg-[#161618] border border-white/[0.08] rounded-t-2xl pb-safe"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/[0.06]">
              <span className="text-sm font-bold text-zinc-300">자주 가는 곳 랭킹</span>
              <button
                onClick={() => setShowAllPlaces(false)}
                className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-zinc-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: '60vh' }}>
              {places.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPlace(p); setSelectedDrive(null); setPositions([]); setShowAllPlaces(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] last:border-0 hover:bg-white/[0.03] transition-colors text-left"
                >
                  <span className={`text-sm font-black w-7 text-center flex-shrink-0 ${i < 3 ? 'text-amber-400' : 'text-zinc-600'}`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-300 text-sm truncate">{p.label || p.city || '—'}</p>
                    {p.city && p.label !== p.city && (
                      <p className="text-zinc-600 text-xs truncate">{p.city}</p>
                    )}
                  </div>
                  <span className="text-zinc-400 text-sm tabular-nums flex-shrink-0">{p.visit_count}회</span>
                </button>
              ))}
            </div>
            <div className="h-6" />
          </div>
        </div>
      )}

      {/* Body: map + list */}
      <div className="flex-1 flex flex-col gap-4 px-4 pb-4 min-h-0">

        {/* Map panel */}
        <div className="flex flex-col bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden min-h-[200px]" style={{ height: '35vh' }}>
          {selectedDrive ? (
            <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-4 flex-shrink-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-500 mb-0.5 tabular-nums">{formatTimeRange(selectedDrive.start_date, selectedDrive.end_date)}</p>
                <p className="text-base text-zinc-300 truncate">
                  {shortAddr(selectedDrive.start_address) || '출발지'}&nbsp;→&nbsp;{shortAddr(selectedDrive.end_address) || '도착지'}
                </p>
              </div>
              <div className="flex gap-3 flex-shrink-0 text-right">
                <div>
                  <p className="text-blue-400 font-bold text-base">{selectedDrive.distance} km</p>
                  <p className="text-zinc-600 text-xs">거리</p>
                </div>
                <div>
                  <p className="text-zinc-300 font-semibold text-base">{formatDuration(selectedDrive.duration_min)}</p>
                  <p className="text-zinc-600 text-xs">시간</p>
                </div>
                {eff && (
                  <div>
                    <p className="text-green-400 font-semibold text-base">{eff.kwh} kWh</p>
                    <p className="text-zinc-600 text-xs">{eff.perKm} Wh/km</p>
                  </div>
                )}
              </div>
            </div>
          ) : selectedPlace ? (
            <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-3 flex-shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0" />
              <p className="text-base text-zinc-300 truncate flex-1">{selectedPlace.label}</p>
              <span className="text-amber-400 text-sm tabular-nums flex-shrink-0">{selectedPlace.visit_count}회</span>
            </div>
          ) : null}
          <div className="flex-1 p-2">
            <DriveMap positions={positions} loading={loadingRoute} placeMarker={selectedPlace} />
          </div>
        </div>

        {/* Drive list */}
        <div className="w-full flex flex-col bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0">
            <span className="text-xs font-bold tracking-widest text-zinc-500 uppercase">주행 이력</span>
            <span className="text-zinc-600 text-sm">{loadingDrives ? '…' : `${drives.length}건`}</span>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: '40vh' }}>
            {loadingDrives ? (
              <div className="flex items-center justify-center h-24">
                <div className="w-6 h-6 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
              </div>
            ) : error ? (
              <p className="text-red-400 text-sm text-center py-4">{error}</p>
            ) : !drives.length ? (
              <p className="text-zinc-500 text-sm text-center py-4">주행 기록이 없습니다</p>
            ) : (
              drives.map((d) => {
                const isSelected = selectedDrive?.id === d.id;
                const eff = efficiency(d);
                const dt = new Date(d.start_date);
                const dateLabel = `${dt.getMonth()+1}/${dt.getDate()}`;
                const timeLabel = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
                const startPct = d.start_battery_level ?? null;
                const endPct   = d.end_battery_level   ?? null;
                const usedPct  = (startPct != null && endPct != null) ? Math.max(0, startPct - endPct) : 0;
                return (
                  <button
                    key={d.id}
                    onClick={() => { setSelectedDrive(d); setSelectedPlace(null); }}
                    className={`w-full text-left grid grid-cols-[62px_1fr_auto] items-center gap-2.5 px-4 py-3 border-b border-white/[0.06] last:border-0 transition-all ${
                      isSelected ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : 'hover:bg-white/[0.025] border-l-2 border-l-transparent'
                    }`}
                  >
                    {/* 좌측: 날짜 + 시각 */}
                    <div className="text-xs text-zinc-500 leading-tight tabular-nums">
                      <p className="text-zinc-300 font-bold text-sm">{dateLabel}</p>
                      <p>{timeLabel}</p>
                    </div>
                    {/* 중앙: 경로 + 메타 */}
                    <div className="min-w-0">
                      <p className={`text-sm truncate ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                        {shortAddr(d.start_address) || '?'}<span className="text-zinc-500 mx-1">→</span>{shortAddr(d.end_address) || '?'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-zinc-600 tabular-nums">{formatDuration(d.duration_min)}</span>
                        {startPct != null && endPct != null && (
                          <div className="flex items-center gap-1 text-xs text-zinc-500 tabular-nums">
                            <span>{startPct}%</span>
                            <div className="w-11 h-1.5 bg-zinc-700 rounded-sm overflow-hidden relative">
                              <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${usedPct}%`, background: 'linear-gradient(90deg, rgba(96,165,250,.5), rgba(248,113,113,.6))' }} />
                            </div>
                            <span>{endPct}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* 우측: km + kWh */}
                    <div className="text-right">
                      <p className={`text-base font-bold tabular-nums ${isSelected ? 'text-blue-400' : 'text-white/80'}`}>
                        {d.distance}<span className="text-xs font-medium text-zinc-600 ml-0.5">km</span>
                      </p>
                      {eff && <p className="text-xs text-green-400/85 tabular-nums">{eff.kwh}<span className="text-[10px] ml-0.5">kWh</span></p>}
                    </div>
                  </button>
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
