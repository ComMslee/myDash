'use client';
import { useEffect, useRef, useState } from 'react';

// ── 상수 ─────────────────────────────────────────────────────
const NAV_H_PX = 64;

const TABS = [
  { id: 'drives', label: '주행' },
  { id: 'history', label: '이력' },
  { id: 'battery', label: '배터리' },
  { id: 'chargers', label: '집 충전소' },
];

// 탭별 표지(peek) 데이터 — 각 탭의 '주요 포인트'
const TAB_DATA = {
  drives: {
    accent: '#34d399',
    accentSoft: 'rgba(52,211,153,0.10)',
    peekH: 144,
    title: '오늘 주행',
    metric: '25.4',
    unit: 'km',
    sub: '1h 12m · ⚡5.8km/kWh · 평속 38km/h',
    nav: '25.4 km',
  },
  history: {
    accent: '#a78bfa',
    accentSoft: 'rgba(167,139,250,0.10)',
    peekH: 160,
    title: '최근 주행',
    metric: '서울 → 부산',
    unit: '',
    sub: '5/7 · 391km · 4h 20m · 86% 사용',
    nav: '7건 · 5/7',
  },
  battery: {
    accent: '#60a5fa',
    accentSoft: 'rgba(96,165,250,0.10)',
    peekH: 188,
    title: '배터리',
    metric: '78',
    unit: '%',
    sub: '⚡7.2kW 충전 중 · 만충까지 1h 20m',
    nav: '78% · ⚡',
  },
  chargers: {
    accent: '#fbbf24',
    accentSoft: 'rgba(251,191,36,0.10)',
    peekH: 124,
    title: '집 충전소',
    metric: '96',
    unit: '%',
    sub: '폴링 정상 · 1분 전 · TTL 5분 · 큐 0',
    nav: '96% 정상',
  },
};

// ── 표지 시각요소 ───────────────────────────────────────────
function CoverDrives({ accent }) {
  const points = [12.1, 18.3, 9.8, 25.0, 14.2, 22.1, 25.4];
  const max = Math.max(...points);
  return (
    <div className="flex flex-col items-end">
      <svg viewBox="0 0 84 36" className="w-24 h-9" preserveAspectRatio="none">
        <defs>
          <linearGradient id="dr-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={`M 0,36 ${points.map((p, i) => `L ${i * (84 / (points.length - 1))},${36 - (p / max) * 32}`).join(' ')} L 84,36 Z`}
          fill="url(#dr-grad)"
        />
        <polyline
          fill="none"
          stroke={accent}
          strokeWidth="1.5"
          strokeLinejoin="round"
          points={points.map((p, i) => `${i * (84 / (points.length - 1))},${36 - (p / max) * 32}`).join(' ')}
        />
        <circle cx={84} cy={36 - (points[points.length - 1] / max) * 32} r="2" fill={accent} />
      </svg>
      <div className="text-[9px] text-zinc-600 mt-1">최근 7일</div>
    </div>
  );
}

function CoverHistory({ accent }) {
  return (
    <div className="flex flex-col items-end">
      <svg viewBox="0 0 100 50" className="w-28 h-14">
        <rect x="0" y="0" width="100" height="50" rx="4" fill="rgba(255,255,255,0.02)" />
        <path
          d="M 12 38 Q 30 18 50 30 Q 70 42 88 16"
          fill="none"
          stroke={accent}
          strokeWidth="1.6"
          strokeDasharray="3,2"
          strokeLinecap="round"
        />
        <circle cx="12" cy="38" r="3" fill={accent} />
        <circle cx="88" cy="16" r="3" fill={accent} />
        <text x="3" y="48" fontSize="6" fill="rgba(255,255,255,0.5)">서울</text>
        <text x="73" y="11" fontSize="6" fill="rgba(255,255,255,0.5)">부산</text>
      </svg>
      <div className="text-[9px] text-zinc-600 mt-0.5">출발 → 도착</div>
    </div>
  );
}

function SocRing({ accent, value, size = 72 }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth="5" fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={accent}
        strokeWidth="5"
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        strokeLinecap="round"
      />
      <text x={size / 2} y={size / 2 + 5} textAnchor="middle" fontSize="18" fill="white" fontWeight="bold">{value}</text>
      <text x={size / 2} y={size / 2 + 17} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.5)">%</text>
    </svg>
  );
}

function CoverBattery({ accent, value }) {
  return (
    <div className="flex items-center gap-3">
      <SocRing accent={accent} value={value} size={84} />
      <div className="flex flex-col gap-1 text-right">
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: accent }} />
          <span className="text-[10px] text-zinc-400">충전 중</span>
        </div>
        <div className="text-[18px] font-bold tabular-nums" style={{ color: accent }}>7.2<span className="text-[10px] text-zinc-500 ml-0.5">kW</span></div>
        <div className="text-[9px] text-zinc-500">1h 20m 후 만충</div>
      </div>
    </div>
  );
}

function CoverChargers({ accent }) {
  const cells = Array.from({ length: 12 }, (_, i) => {
    const v = (i * 47 + 13) % 100;
    if (v > 90) return 'rgba(244,63,94,0.7)';
    if (v > 75) return 'rgba(245,158,11,0.7)';
    return accent;
  });
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <div className="relative">
          <div className="w-2 h-2 rounded-full" style={{ background: accent }} />
          <div className="absolute inset-0 w-2 h-2 rounded-full animate-ping" style={{ background: accent, opacity: 0.6 }} />
        </div>
        <span className="text-[10px] text-zinc-400">실시간</span>
      </div>
      <div className="flex gap-0.5">
        {cells.map((c, i) => (
          <div key={i} className="w-2 h-3 rounded-sm" style={{ background: c, opacity: 0.4 + i / 24 }} />
        ))}
      </div>
      <div className="text-[9px] text-zinc-600">최근 12시간</div>
    </div>
  );
}

function CoverArt({ tabId }) {
  const d = TAB_DATA[tabId];
  if (tabId === 'drives') return <CoverDrives accent={d.accent} />;
  if (tabId === 'history') return <CoverHistory accent={d.accent} />;
  if (tabId === 'battery') return <CoverBattery accent={d.accent} value={parseInt(d.metric, 10)} />;
  if (tabId === 'chargers') return <CoverChargers accent={d.accent} />;
  return null;
}

// ── 확장 본문 ─────────────────────────────────────────────────
function StatGrid({ accent, items }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((it) => (
        <div key={it.label} className="bg-[#0f0f0f] border border-white/[0.06] rounded-lg p-2.5">
          <div className="text-[10px] text-zinc-500">{it.label}</div>
          <div className="text-sm font-bold tabular-nums mt-0.5" style={{ color: accent }}>
            {it.value}
            {it.unit && <span className="text-[10px] text-zinc-500 ml-0.5">{it.unit}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function ExpandedDrives() {
  const d = TAB_DATA.drives;
  const drives = [
    { date: '5/8 14:23', from: '강남구 청담동', to: '서초구 반포동', km: 12.4, eff: 5.6 },
    { date: '5/8 09:11', from: '서초구 반포동', to: '강남구 청담동', km: 13.0, eff: 6.0 },
    { date: '5/7 22:18', from: '용산구 한남동', to: '서초구 반포동', km: 8.2, eff: 5.4 },
    { date: '5/7 18:42', from: '서초구 반포동', to: '용산구 한남동', km: 8.5, eff: 5.2 },
    { date: '5/7 11:05', from: '강남구 청담동', to: '서초구 반포동', km: 11.9, eff: 5.9 },
  ];
  return (
    <div className="px-4 py-3 space-y-3">
      <StatGrid accent={d.accent} items={[
        { label: '오늘', value: '25.4', unit: 'km' },
        { label: '7일 평균', value: '18.2', unit: 'km' },
        { label: '이번 달', value: '412', unit: 'km' },
      ]} />
      <div className="bg-[#0f0f0f] border border-white/[0.06] rounded-lg p-3">
        <div className="text-[11px] text-zinc-400 font-semibold mb-2">최근 7일</div>
        <CoverDrives accent={d.accent} />
      </div>
      <div>
        <div className="text-[11px] text-zinc-400 font-semibold mb-1.5">최근 주행 5건</div>
        <div className="space-y-1">
          {drives.map((dr, i) => (
            <div key={i} className="bg-[#0f0f0f] border border-white/[0.06] rounded-lg px-3 py-2">
              <div className="flex justify-between items-baseline">
                <div className="text-[11px] text-zinc-300 tabular-nums">{dr.date}</div>
                <div className="text-[12px] font-bold tabular-nums" style={{ color: d.accent }}>{dr.km}km</div>
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5 truncate">{dr.from} → {dr.to}</div>
              <div className="text-[10px] text-zinc-600 mt-0.5">⚡{dr.eff}km/kWh</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExpandedHistory() {
  const d = TAB_DATA.history;
  const trips = [
    { date: '5/7', route: '서울 강남 → 부산 해운대', km: 391, h: '4h 20m', soc: '95%→9%' },
    { date: '5/3', route: '서울 한남 → 강릉 경포대', km: 235, h: '2h 50m', soc: '90%→32%' },
    { date: '4/28', route: '서울 → 양양 서피비치', km: 178, h: '2h 10m', soc: '78%→35%' },
    { date: '4/14', route: '서울 → 속초', km: 195, h: '2h 25m', soc: '85%→38%' },
  ];
  const places = [
    { name: '강남 본가', count: 24 },
    { name: '회사 (서초)', count: 19 },
    { name: '한강공원 반포', count: 7 },
    { name: '부산 해운대', count: 3 },
  ];
  return (
    <div className="px-4 py-3 space-y-3">
      <div>
        <div className="text-[11px] text-zinc-400 font-semibold mb-1.5">장거리 주행</div>
        <div className="space-y-1.5">
          {trips.map((t, i) => (
            <div key={i} className="bg-[#0f0f0f] border border-white/[0.06] rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-zinc-500 tabular-nums">{t.date}</div>
                <div className="text-[11px] font-bold tabular-nums" style={{ color: d.accent }}>{t.km}km</div>
              </div>
              <div className="text-[12px] text-zinc-200 mt-0.5 truncate">{t.route}</div>
              <div className="flex justify-between text-[10px] text-zinc-500 mt-1 tabular-nums">
                <span>{t.h}</span>
                <span>{t.soc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[11px] text-zinc-400 font-semibold mb-1.5">자주 가는 곳</div>
        <div className="bg-[#0f0f0f] border border-white/[0.06] rounded-lg p-3 space-y-1.5">
          {places.map((p) => (
            <div key={p.name} className="flex justify-between items-center text-[12px]">
              <span className="text-zinc-300">{p.name}</span>
              <span className="text-zinc-500 tabular-nums">{p.count}회</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SocLineChart({ accent }) {
  // 24시간 SOC 변화 라인
  const points = [42, 41, 40, 38, 36, 34, 33, 30, 27, 26, 28, 35, 40, 45, 48, 50, 53, 58, 65, 72, 76, 78, 78, 78];
  return (
    <svg viewBox="0 0 240 80" className="w-full h-20" preserveAspectRatio="none">
      <defs>
        <linearGradient id="bt-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.4" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`M 0,80 ${points.map((p, i) => `L ${i * (240 / (points.length - 1))},${80 - (p / 100) * 76}`).join(' ')} L 240,80 Z`}
        fill="url(#bt-grad)"
      />
      <polyline
        fill="none"
        stroke={accent}
        strokeWidth="1.5"
        points={points.map((p, i) => `${i * (240 / (points.length - 1))},${80 - (p / 100) * 76}`).join(' ')}
      />
    </svg>
  );
}

function ExpandedBattery() {
  const d = TAB_DATA.battery;
  const sessions = [
    { date: '5/8 06:00', kwh: 24.5, h: '3h 20m', from: 26, to: 78, type: '집' },
    { date: '5/6 23:18', kwh: 18.2, h: '2h 30m', from: 38, to: 82, type: '집' },
    { date: '5/3 17:05', kwh: 42.3, h: '0h 35m', from: 12, to: 78, type: '슈퍼차저' },
    { date: '5/1 22:40', kwh: 22.0, h: '3h 00m', from: 35, to: 85, type: '집' },
  ];
  return (
    <div className="px-4 py-3 space-y-3">
      <div className="bg-[#0f0f0f] border border-white/[0.06] rounded-lg p-3">
        <div className="flex items-center gap-3">
          <SocRing accent={d.accent} value={78} size={88} />
          <div className="flex-1">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide">현재 상태</div>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: d.accent }} />
              <span className="text-[12px] text-zinc-200 font-semibold">충전 중</span>
            </div>
            <div className="text-[20px] font-bold tabular-nums mt-0.5" style={{ color: d.accent }}>
              7.2<span className="text-[11px] text-zinc-500 ml-0.5">kW</span>
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">만충까지 1h 20m</div>
          </div>
        </div>
      </div>
      <div className="bg-[#0f0f0f] border border-white/[0.06] rounded-lg p-3">
        <div className="text-[11px] text-zinc-400 font-semibold mb-2">24시간 SOC 변화</div>
        <SocLineChart accent={d.accent} />
        <div className="flex justify-between text-[9px] text-zinc-600 mt-1 tabular-nums">
          <span>00시</span><span>06시</span><span>12시</span><span>18시</span><span>현재</span>
        </div>
      </div>
      <StatGrid accent={d.accent} items={[
        { label: '평균 SOC', value: '52', unit: '%' },
        { label: '7일 충전', value: '124', unit: 'kWh' },
        { label: '효율', value: '5.7', unit: 'km/kWh' },
      ]} />
      <div>
        <div className="text-[11px] text-zinc-400 font-semibold mb-1.5">최근 충전</div>
        <div className="space-y-1">
          {sessions.map((s, i) => (
            <div key={i} className="bg-[#0f0f0f] border border-white/[0.06] rounded-lg px-3 py-2">
              <div className="flex justify-between items-baseline">
                <div className="text-[11px] text-zinc-300 tabular-nums">{s.date}</div>
                <div className="text-[12px] font-bold tabular-nums" style={{ color: d.accent }}>+{s.kwh}kWh</div>
              </div>
              <div className="flex justify-between text-[10px] text-zinc-500 mt-1 tabular-nums">
                <span>{s.type} · {s.h}</span>
                <span>{s.from}% → {s.to}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExpandedChargers() {
  const d = TAB_DATA.chargers;
  // 5x24 히트맵
  const cells = Array.from({ length: 5 * 24 }, (_, i) => {
    const v = (i * 137 + 31) % 100;
    if (v > 92) return 'bg-rose-700';
    if (v > 80) return 'bg-amber-700';
    if (v > 50) return 'bg-emerald-700';
    if (v > 25) return 'bg-emerald-800/70';
    return 'bg-emerald-900/40';
  });
  return (
    <div className="px-4 py-3 space-y-3">
      <div className="bg-[#0f0f0f] border border-amber-500/30 rounded-lg p-3" style={{ background: d.accentSoft }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.accent }} />
              <div className="absolute inset-0 w-2.5 h-2.5 rounded-full animate-ping" style={{ background: d.accent, opacity: 0.6 }} />
            </div>
            <span className="text-[12px] font-bold text-zinc-200">정상 폴링</span>
          </div>
          <span className="text-[10px] text-zinc-500 tabular-nums">1분 전</span>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2">
          <div>
            <div className="text-[9px] text-zinc-500">성공률</div>
            <div className="text-[14px] font-bold tabular-nums" style={{ color: d.accent }}>96%</div>
          </div>
          <div>
            <div className="text-[9px] text-zinc-500">TTL</div>
            <div className="text-[14px] font-bold tabular-nums text-zinc-200">5분</div>
          </div>
          <div>
            <div className="text-[9px] text-zinc-500">큐</div>
            <div className="text-[14px] font-bold tabular-nums text-zinc-200">0</div>
          </div>
        </div>
      </div>
      <div className="bg-[#0f0f0f] border border-white/[0.06] rounded-lg p-3">
        <div className="flex justify-between items-center mb-2">
          <div className="text-[11px] text-zinc-400 font-semibold">시간대별 폴링 (오늘)</div>
          <div className="flex gap-0.5 text-[8px] text-zinc-600">
            <div className="flex items-center gap-0.5"><div className="w-2 h-2 bg-emerald-700 rounded-sm" />성공</div>
            <div className="flex items-center gap-0.5 ml-1"><div className="w-2 h-2 bg-amber-700 rounded-sm" />지연</div>
            <div className="flex items-center gap-0.5 ml-1"><div className="w-2 h-2 bg-rose-700 rounded-sm" />실패</div>
          </div>
        </div>
        <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
          {cells.map((c, i) => (
            <div key={i} className={`${c} aspect-square rounded-sm`} />
          ))}
        </div>
        <div className="flex justify-between text-[9px] text-zinc-600 mt-1 tabular-nums">
          <span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>23시</span>
        </div>
      </div>
      <div>
        <div className="text-[11px] text-zinc-400 font-semibold mb-1.5">최근 14일</div>
        <div className="space-y-0.5">
          {Array.from({ length: 14 }).map((_, i) => {
            const rate = 95 - ((i * 3) % 18);
            return (
              <div key={i} className="flex justify-between items-center px-2 py-1.5 border-b border-white/[0.04] text-[12px]">
                <span className="text-zinc-300 tabular-nums">2026-05-{String(8 - i).padStart(2, '0')}</span>
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 24 }, (_, j) => {
                      const v = ((i * 11 + j * 17) % 100);
                      const cls = v > 90 ? 'bg-rose-700' : v > 75 ? 'bg-amber-700' : 'bg-emerald-700';
                      return <div key={j} className={`${cls} w-0.5 h-3 rounded-sm`} />;
                    })}
                  </div>
                  <span className="text-zinc-500 tabular-nums w-9 text-right">{rate}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ExpandedBody({ tabId }) {
  if (tabId === 'drives') return <ExpandedDrives />;
  if (tabId === 'history') return <ExpandedHistory />;
  if (tabId === 'battery') return <ExpandedBattery />;
  if (tabId === 'chargers') return <ExpandedChargers />;
  return null;
}

// ── 표지 시트 (드래그/탭으로 expand/collapse) ─────────────────
function PeekSheet({ tabId, expanded, onExpand, onCollapse }) {
  const d = TAB_DATA[tabId];
  const dragRef = useRef({ y: null });
  const [dragDy, setDragDy] = useState(0);

  function onPointerDown(e) {
    dragRef.current.y = e.clientY;
    setDragDy(0);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (dragRef.current.y == null) return;
    setDragDy(e.clientY - dragRef.current.y);
  }
  function onPointerUp() {
    if (dragRef.current.y == null) return;
    const dy = dragDy;
    dragRef.current.y = null;
    setDragDy(0);
    if (!expanded && dy < -32) onExpand();
    else if (expanded && dy > 80) onCollapse();
  }

  // 시트 위치/크기
  const peekHeight = d.peekH;
  const expandedHeight = `calc(85dvh - ${NAV_H_PX}px)`;
  const liveTransform = expanded
    ? `translateY(${Math.max(0, dragDy)}px)`
    : `translateY(${Math.min(0, Math.max(-12, dragDy / 4))}px)`;

  return (
    <>
      {expanded && (
        <div
          className="fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm"
          onClick={onCollapse}
          style={{ animation: 'b2-fadeIn 0.3s' }}
        />
      )}
      <div
        className="fixed left-0 right-0 z-[60] flex justify-center pointer-events-none"
        style={{ bottom: NAV_H_PX }}
      >
        <div
          className="w-full max-w-2xl bg-[#161618] border-t border-x border-white/[0.08] rounded-t-3xl flex flex-col overflow-hidden pointer-events-auto"
          style={{
            height: expanded ? expandedHeight : peekHeight,
            transition: dragRef.current.y != null
              ? 'none'
              : 'height 0.4s cubic-bezier(0.32,0.72,0,1), transform 0.32s cubic-bezier(0.32,0.72,0,1)',
            transform: liveTransform,
            borderTop: `2px solid ${d.accent}`,
            boxShadow: '0 -12px 32px rgba(0,0,0,0.4)',
          }}
        >
          {/* 드래그 핸들 + 표지 헤더 */}
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { dragRef.current.y = null; setDragDy(0); }}
            onClick={() => { if (dragDy === 0) (expanded ? onCollapse() : onExpand()); }}
            className="shrink-0 cursor-pointer touch-none select-none"
            style={{ background: d.accentSoft }}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: `${d.accent}88` }} />
            </div>
            <div className="px-4 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1" key={tabId} style={{ animation: 'b2-coverIn 0.32s' }}>
                  <div className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: d.accent }}>
                    {d.title}
                  </div>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-[28px] font-bold text-zinc-100 tabular-nums leading-none">
                      {d.metric}
                    </span>
                    {d.unit && <span className="text-sm text-zinc-400">{d.unit}</span>}
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1.5 truncate">{d.sub}</div>
                </div>
                <div className="shrink-0" key={`art-${tabId}`} style={{ animation: 'b2-coverIn 0.32s' }}>
                  <CoverArt tabId={tabId} />
                </div>
              </div>
              {!expanded && (
                <div className="text-[9px] text-zinc-600 mt-2 text-right">
                  탭 또는 ↑ 위로 끌어 자세히 보기
                </div>
              )}
            </div>
          </div>

          {/* 확장 시 본문 */}
          {expanded && (
            <div className="flex-1 overflow-y-auto overscroll-contain border-t border-white/[0.06]">
              <ExpandedBody tabId={tabId} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── 목업 내비바 (탭별 라이브 정보 노출) ──────────────────────
function MockNav({ activeId, onTabClick }) {
  return (
    <nav
      aria-label="목업 내비바"
      className="fixed bottom-0 left-0 right-0 z-50 bg-[#0f0f0f]/95 backdrop-blur border-t border-white/[0.06]"
      style={{ height: NAV_H_PX }}
    >
      <div className="max-w-2xl mx-auto h-full flex">
        {TABS.map((t) => {
          const isActive = t.id === activeId;
          const data = TAB_DATA[t.id];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabClick(t.id)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 px-1 min-w-0"
              style={{ color: isActive ? data.accent : '#71717a' }}
            >
              <span className="text-[11px] font-semibold leading-tight">{t.label}</span>
              <span
                key={data.nav}
                className="text-[10px] tabular-nums leading-none truncate max-w-full"
                style={{
                  color: isActive ? data.accent : '#a1a1aa',
                  opacity: isActive ? 1 : 0.55,
                  animation: 'b2-coverIn 0.3s',
                }}
              >
                {data.nav}
              </span>
              <span
                className="w-1 h-1 rounded-full mt-0.5"
                style={{ background: isActive ? data.accent : 'transparent' }}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ── 페이지 ───────────────────────────────────────────────────
export default function SheetB2DetailMockup() {
  const [activeTab, setActiveTab] = useState('battery');
  const [expanded, setExpanded] = useState(false);

  // ESC = collapse
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape' && expanded) setExpanded(false); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [expanded]);

  // 확장 시 body 스크롤 락
  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [expanded]);

  const d = TAB_DATA[activeTab];

  return (
    <main className="min-h-dvh bg-[#0f0f0f] text-zinc-200">
      <style>{`
        @keyframes b2-fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes b2-coverIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>

      <div
        className="max-w-2xl mx-auto px-4 pt-6"
        style={{ paddingBottom: d.peekH + NAV_H_PX + 32 }}
      >
        <div className="mb-4">
          <h1 className="text-lg font-bold mb-1">B2 표지 시트 — 디테일 구현</h1>
          <p className="text-[12px] text-zinc-500 leading-relaxed">
            • 내비바 탭 = 표지(peek) 콘텐츠 전환 + 높이 자동 조정<br />
            • 표지 탭 또는 위로 드래그(↑32px) = 확장<br />
            • 백드롭/ESC/아래로 드래그(↓80px) = 축소
          </p>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] text-zinc-500">
            현재 페이지: <span className="font-semibold" style={{ color: d.accent }}>{d.title}</span>
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[#161618] border border-white/[0.06] rounded-xl p-4">
              <div className="text-[11px] text-zinc-500">페이지 본문 카드 {i + 1}</div>
              <div className="text-[13px] text-zinc-300 mt-1">
                표지(시트) 뒤에 보이는 페이지 콘텐츠 — 시트가 축소된 상태에선 이 본문이 주, 표지는 보조.
              </div>
            </div>
          ))}
        </div>
      </div>

      <PeekSheet
        tabId={activeTab}
        expanded={expanded}
        onExpand={() => setExpanded(true)}
        onCollapse={() => setExpanded(false)}
      />
      <MockNav activeId={activeTab} onTabClick={(id) => setActiveTab(id)} />
    </main>
  );
}
