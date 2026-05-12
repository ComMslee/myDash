'use client';

import { useRef, useEffect, useState } from 'react';
import { loadLeaflet } from '@/app/components/DriveMap';

// 잔여 SOC × rated km × 도로계수 → 편도/왕복 반경을 Leaflet 원 2겹으로 오버레이.
// 차량 마지막 위치를 중심으로 표시. 데이터 없으면 카드 자체 숨김.
export default function RangeMapCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/range-radius')
      .then(r => r.json())
      .then(d => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) { setData({ available: false }); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!data?.available || typeof window === 'undefined') return;
    loadLeaflet(() => {
      const L = window.L;
      if (!containerRef.current) return;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      const map = L.map(containerRef.current, {
        zoomControl: true, attributionControl: false, scrollWheelZoom: false,
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
      mapRef.current = map;

      const { lat, lng } = data.position;
      const oneWayM = Math.max(500, data.one_way_km * 1000);
      const roundM = Math.max(250, data.round_trip_km * 1000);

      // 편도 (외곽 노랑)
      const c1 = L.circle([lat, lng], {
        radius: oneWayM, color: '#fbbf24', fillColor: '#fbbf24',
        fillOpacity: 0.06, weight: 1.5,
      }).addTo(map);
      // 왕복 (내곽 초록 점선)
      L.circle([lat, lng], {
        radius: roundM, color: '#10b981', fillColor: '#10b981',
        fillOpacity: 0.12, weight: 1.5, dashArray: '4 4',
      }).addTo(map);
      // 차량 마커
      L.circleMarker([lat, lng], {
        radius: 6, fillColor: '#3b82f6', color: '#fff', weight: 2, fillOpacity: 1,
      }).addTo(map);

      // 초기 size 0 회피 — invalidateSize + animate:false fitBounds (DriveMap 함정 패턴 차용)
      setTimeout(() => {
        map.invalidateSize();
        map.fitBounds(c1.getBounds(), { padding: [20, 20], animate: false });
      }, 150);
    });
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [data]);

  if (loading) {
    return (
      <div className="bg-[#161618] rounded-xl p-6 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
      </div>
    );
  }
  if (!data?.available) return null;

  const tone = data.soc <= 10 ? 'text-rose-400' : data.soc <= 25 ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div className="bg-[#161618] rounded-xl overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-baseline gap-2 flex-wrap">
        <span className="text-xs text-zinc-400">잔여 거리</span>
        <span className={`text-lg font-bold tabular-nums ${tone}`}>{data.soc}%</span>
        <span className="text-sm text-zinc-300 tabular-nums">· {data.rated_km}km</span>
        {data.is_charging && <span className="text-[10px] text-amber-400 ml-1">⚡ 충전 중</span>}
        <span className="ml-auto text-[10px] text-zinc-500">×{data.road_factor} 도로 보정</span>
      </div>
      <div className="relative">
        <div ref={containerRef} className="w-full" style={{ height: '280px' }} />
        <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm rounded-md px-2 py-1.5 text-[11px] tabular-nums z-[400] pointer-events-none">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#fbbf24' }} />
            <span className="text-zinc-200">편도 {data.one_way_km}km</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#10b981' }} />
            <span className="text-zinc-200">왕복 {data.round_trip_km}km</span>
          </div>
        </div>
      </div>
      <div className="px-4 py-2 text-[10px] text-zinc-500">
        직선거리 추정 · rated km 기준 · 마지막 위치
      </div>
    </div>
  );
}
