'use client';

import { useRef, useEffect, useCallback, useState } from 'react';

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
  // Leaflet 부팅 + 첫 invalidateSize/drawContent 완료 전까지 spinner 노출 게이트.
  // 첫 클릭 시 회색 빈 컨테이너가 보이던 공백을 로딩 오버레이로 덮는다.
  const [mapReady, setMapReady] = useState(false);

  // ── DEBUG (임시) ───────────────────────────────────────────
  // 첫 진입 polyline 미표시 회귀 진단용. 우상단 오버레이에 lifecycle 이벤트 로그.
  const [dbg, setDbg] = useState([]);
  const t0Ref = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  const log = useCallback((msg) => {
    const t = Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - t0Ref.current);
    setDbg(d => [...d.slice(-29), `${String(t).padStart(5)}ms ${msg}`]);
  }, []);
  const containerSize = () => {
    const el = containerRef.current;
    if (!el) return 'no-el';
    return `${el.offsetWidth}x${el.offsetHeight}`;
  };
  const mapSize = () => {
    const m = mapInstanceRef.current;
    if (!m) return 'no-map';
    const s = m.getSize?.();
    return s ? `${s.x}x${s.y}` : '?';
  };
  // ───────────────────────────────────────────────────────────

  const initMap = useCallback(() => {
    if (!containerRef.current || mapInstanceRef.current || !window.L) return;
    const L = window.L;
    mapInstanceRef.current = L.map(containerRef.current, {
      zoomControl: true, attributionControl: false,
    }).setView([37.5665, 126.9780], 11);
    mapRef.current = mapInstanceRef.current;
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(mapInstanceRef.current);
    log(`initMap done c=${containerSize()} m=${mapSize()}`);
  }, [log]);

  const drawContent = useCallback(() => {
    const map = mapRef.current;
    const L = window.L;
    if (!map || !L) {
      log(`drawContent SKIP map=${!!map} L=${!!L}`);
      return;
    }
    log(`drawContent pos=${positions?.length ?? 0} routes=${routes?.length ?? '∅'} place=${!!placeMarker} c=${containerSize()} m=${mapSize()}`);
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
        log(`fitBounds(routes) m=${mapSize()} pts=${allLatLngs.length}`);
        // animate:false — animate(default true) 진행 중 setPositions([]) 등에 의해
        // cancel 되어 view 가 default(서울) 에 고정되던 race condition 제거
        map.fitBounds(L.latLngBounds(allLatLngs), { padding: [50, 50], animate: false });
      }
      return;
    }

    if (!positions || positions.length < 2) { log(`drawContent EARLY pos<2`); return; }
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
    log(`fitBounds(single) m=${mapSize()} pts=${latlngs.length}`);
    // animate:false — animate(default true) 진행 중 setPositions([]) 등에 의해
    // cancel 되어 view 가 default(서울) 에 고정되던 race condition 제거
    map.fitBounds(L.latLngBounds(latlngs), { padding: [50, 50], animate: false });
    log(`after fitBounds center=${map.getCenter()?.lat?.toFixed(3)},${map.getCenter()?.lng?.toFixed(3)} z=${map.getZoom()}`);
  }, [positions, routes, placeMarker, log]);

  // Keep a ref to the latest drawContent so init callback always calls current version
  const drawContentRef = useRef(drawContent);
  useEffect(() => { drawContentRef.current = drawContent; }, [drawContent]);

  // Init map once on mount — invalidateSize 후 drawContent 를 한 번 더 실행해
  // 첫 마운트(컨테이너 layout 미정착 / Leaflet 내부 size 캐시 어긋남) 시
  // polyline 이 화면에 그려지지 않던 케이스 보강.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    log(`MOUNT visible=${visible} c=${containerSize()}`);
    loadLeaflet(() => {
      log(`leaflet onload c=${containerSize()}`);
      initMap();
      drawContentRef.current();
      setTimeout(() => {
        log(`mount T+150 invalidateSize c=${containerSize()} m=${mapSize()}`);
        mapInstanceRef.current?.invalidateSize();
        log(`after invalidateSize m=${mapSize()}`);
        drawContentRef.current?.();
        setMapReady(true);
        log(`mapReady=true`);
      }, 150);
    });
    return () => {
      log(`UNMOUNT`);
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw when positions / placeMarker change
  // drawContent 직전에 invalidateSize 호출 — 데이터(positions/routes) 도착 시점에 컨테이너 layout
  // 이 settled 되지 않은 상태이면 fitBounds 가 0-size 기준으로 잘못 계산되어 polyline 이 보이지
  // 않고 default(서울) view 에 고정되던 회귀 보강. mount 시점의 setTimeout(150ms) 만으로는
  // 데이터가 그 이후 도착하는 cold-cache 첫 진입을 못 잡음.
  useEffect(() => {
    log(`[drawContent] effect map=${!!mapRef.current} L=${typeof window !== 'undefined' && !!window.L} pos=${positions?.length ?? 0}`);
    if (!mapRef.current || !window.L) return;
    mapRef.current.invalidateSize();
    drawContent();
  }, [drawContent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resize when tab becomes visible — invalidateSize 로 사이즈 재측정 후
  // drawContent 재호출하여 첫 visibility 전환 시 polyline 이 보이지 않던 케이스 보강.
  useEffect(() => {
    if (visible && mapInstanceRef.current) {
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
        drawContentRef.current?.();
      }, 150);
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
      radius: 7, color: '#ffffff', weight: 2, fillColor: '#ffffff', fillOpacity: 0.5, interactive: false,
    }).addTo(map);
    return () => {
      if (highlightRef.current && mapRef.current) {
        mapRef.current.removeLayer(highlightRef.current);
        highlightRef.current = null;
      }
    };
  }, [highlightLatLng?.lat, highlightLatLng?.lng]);

  return (
    <div className="relative w-full h-full">
      <style>{`
        .leaflet-container { background: #111 !important; }
        .leaflet-control-zoom a { background: #1a1a1a !important; color: #fff !important; border-color: #333 !important; }
        .leaflet-control-zoom a:hover { background: #2a2a2a !important; }
      `}</style>
      <div ref={containerRef} className="w-full h-full" />
      {(loading || !mapReady) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl">
          <div className="w-6 h-6 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
        </div>
      )}
      {!loading && mapReady && !placeMarker && (!routes || routes.length === 0) && (!positions || positions.length < 2) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-300 pointer-events-none bg-black/60 rounded-xl">
          <svg className="w-12 h-12 mb-2 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <p className="text-sm font-semibold">경로 데이터가 없습니다</p>
          <p className="text-xs text-zinc-500 mt-1">이 주행은 GPS 포인트가 기록되지 않았습니다</p>
        </div>
      )}
      {/* DEBUG (임시) — 첫 진입 polyline 미표시 진단용. 우상단 오버레이 */}
      <div
        style={{
          position: 'absolute', top: 4, right: 4, zIndex: 1000,
          maxWidth: 'min(92%, 380px)', maxHeight: '60%', overflowY: 'auto',
          background: 'rgba(0,0,0,0.78)', color: '#9fffa3',
          fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 9, lineHeight: '1.25',
          padding: '4px 6px', borderRadius: 6, whiteSpace: 'pre', pointerEvents: 'auto',
        }}
      >
        {`pos=${positions?.length ?? 0} routes=${routes?.length ?? '∅'} place=${!!placeMarker} loading=${!!loading} mapReady=${mapReady}\n` + dbg.join('\n')}
      </div>
    </div>
  );
}
