'use client';

import { useEffect, useRef, useState } from 'react';
import { loadLeaflet } from '@/app/components/DriveMap';
import { shortAddr } from '@/lib/format';

// 충전 위치 클러스터링 지도 — /api/charging-locations 의 bin 결과를
// Leaflet circleMarker 로 표시. 마커 크기/색상 = 빈도, 색상 = 급속/완속 비율.
//  - rose: fast 비율 > 50%
//  - amber: 혼합
//  - emerald: slow 위주
export default function ChargingLocationsCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/charging-locations')
      .then(r => r.json())
      .then(d => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) { setData({ locations: [] }); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!data?.locations?.length || typeof window === 'undefined') return;
    // alive + timeoutId: Leaflet 스크립트 로드 / setTimeout 이 unmount 후 실행되어
    // 제거된 map 에 invalidateSize/fitBounds 호출되는 race 방지 (RangeMapCard 와 동일 패턴).
    let alive = true;
    let timeoutId = null;
    loadLeaflet(() => {
      if (!alive) return;
      const L = window.L;
      if (!containerRef.current) return;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      const locs = data.locations;

      const map = L.map(containerRef.current, {
        zoomControl: true, attributionControl: false, scrollWheelZoom: false,
      }).setView([locs[0].lat, locs[0].lng], 7);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
      mapRef.current = map;

      const maxCount = Math.max(1, ...locs.map(l => l.count));
      const fmtDate = (iso) => {
        if (!iso) return '';
        const d = new Date(iso);
        return `${d.getMonth() + 1}/${d.getDate()}`;
      };

      for (const loc of locs) {
        const fastRatio = loc.count > 0 ? loc.fast_count / loc.count : 0;
        const color = fastRatio > 0.5 ? '#f43f5e' : fastRatio > 0 ? '#f59e0b' : '#10b981';
        // 반경 6~16px (count 비례)
        const radius = 6 + Math.round(10 * (loc.count / maxCount));
        const marker = L.circleMarker([loc.lat, loc.lng], {
          radius, fillColor: color, color: '#fff', weight: 1.5, fillOpacity: 0.75,
        }).addTo(map);
        const popup = `
          <div style="font-size:11px;line-height:1.4;color:#000;min-width:120px">
            <div style="font-weight:700;margin-bottom:2px">${shortAddr(loc.label)}</div>
            <div>${loc.count}회 · ${loc.total_kwh}kWh</div>
            <div style="color:#666">급속 ${loc.fast_count} · 완속 ${loc.slow_count}</div>
            <div style="color:#666">최근 ${fmtDate(loc.last_date)}</div>
          </div>
        `;
        marker.bindPopup(popup);
      }

      timeoutId = setTimeout(() => {
        if (!alive) return;
        map.invalidateSize();
        const bounds = L.latLngBounds(locs.map(l => [l.lat, l.lng]));
        map.fitBounds(bounds, { padding: [20, 20], maxZoom: 13, animate: false });
      }, 150);
    });
    return () => {
      alive = false;
      if (timeoutId) clearTimeout(timeoutId);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [data]);

  if (loading) {
    return (
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl flex items-center justify-center py-10">
        <div className="w-5 h-5 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }
  if (!data?.locations?.length) return null;

  const totalCount = data.locations.reduce((s, l) => s + l.count, 0);
  const totalKwh = Math.round(data.locations.reduce((s, l) => s + l.total_kwh, 0) * 10) / 10;

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-4 py-2 border-b border-white/[0.06] flex items-center justify-between gap-2 tabular-nums">
        <span className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-xs font-bold text-zinc-200 shrink-0">충전 위치</span>
          <span className="text-[11px] text-zinc-600 shrink-0">{data.locations.length}곳</span>
        </span>
        <span className="flex items-baseline gap-2 text-[11px] shrink-0">
          <span className="text-zinc-400">{totalCount}<span className="text-zinc-600 ml-0.5">회</span></span>
          <span className="text-zinc-200 font-bold">{totalKwh}<span className="text-zinc-600 ml-0.5">kWh</span></span>
        </span>
      </div>
      <div ref={containerRef} className="w-full" style={{ height: '320px' }} />
      <div className="px-4 py-1.5 border-t border-white/[0.06] flex items-center gap-3 text-[10px] text-zinc-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#f43f5e' }} />급속
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#f59e0b' }} />혼합
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#10b981' }} />완속
        </span>
        <span className="text-zinc-600 ml-auto">크기 = 빈도</span>
      </div>
    </div>
  );
}
