'use client';

import { useRef, useEffect, useCallback } from 'react';

// ── Leaflet Map (CDN) ─────────────────────────────────────────

// Module-level queue prevents double-script when called concurrently
let _leafletLoading = false;
const _leafletQueue = [];

export function loadLeaflet(cb) {
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

export default function DriveMap({ positions, routes, loading, placeMarker, visible, highlightLatLng }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const polyRef = useRef(null);
  const markersRef = useRef([]);
  const placeMarkerRef = useRef(null);
  const highlightRef = useRef(null);

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

    // 다중 경로 모드 (일 합계 진입)
    if (routes && routes.length > 0) {
      const group = L.layerGroup().addTo(map);
      const allLatLngs = [];
      const total = routes.length;
      const makeBadge = (label, color) => L.divIcon({
        html: `<div style="background:${color};color:#fff;border:2px solid rgba(255,255,255,0.9);border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;box-shadow:0 0 4px rgba(0,0,0,0.5)">${label}</div>`,
        className: '',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      routes.forEach((r, idx) => {
        const pos = r.positions || [];
        if (pos.length < 2) return;
        const latlngs = pos.map(p => [p.lat, p.lng]);
        allLatLngs.push(...latlngs);
        const color = r.color || '#3b82f6';
        L.polyline(latlngs, { color, weight: 4, opacity: 0.85 }).addTo(group);
        // 시작 마커: 첫 주행=S, 그 외 주행 번호(1, 2, 3...)
        const startLabel = idx === 0 ? 'S' : String(idx);
        const s = L.marker(latlngs[0], { icon: makeBadge(startLabel, color) }).addTo(group);
        // 종료 마커: 마지막 주행만 E 배지, 그 외는 작은 점
        let e;
        if (idx === total - 1) {
          e = L.marker(latlngs[latlngs.length - 1], { icon: makeBadge('E', color) }).addTo(group);
        } else {
          e = L.circleMarker(latlngs[latlngs.length - 1], { radius: 5, fillColor: color, color: '#fff', weight: 1.5, fillOpacity: 0.9 }).addTo(group);
        }
        markersRef.current.push(s, e);
      });
      polyRef.current = group;
      if (allLatLngs.length >= 2) {
        map.fitBounds(L.latLngBounds(allLatLngs), { padding: [50, 50] });
      }
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
  }, [positions, routes, placeMarker]);

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

  // 선택 포인트 하이라이트 마커 (스파크라인 ↔ 지도 동기)
  useEffect(() => {
    const map = mapRef.current;
    const L = typeof window !== 'undefined' ? window.L : null;
    if (!map || !L) return;
    if (highlightRef.current) { map.removeLayer(highlightRef.current); highlightRef.current = null; }
    if (!highlightLatLng || highlightLatLng.lat == null || highlightLatLng.lng == null) return;
    highlightRef.current = L.circleMarker([highlightLatLng.lat, highlightLatLng.lng], {
      radius: 7, color: '#e879f9', weight: 2, fillColor: '#e879f9', fillOpacity: 0.5, interactive: false,
    }).addTo(map);
  }, [highlightLatLng?.lat, highlightLatLng?.lng]);

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
      {!loading && !placeMarker && (!routes || routes.length === 0) && (!positions || positions.length < 2) && (
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
