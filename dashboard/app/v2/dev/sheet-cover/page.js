'use client';
import { useEffect, useRef, useState } from 'react';

// ── 상수 ─────────────────────────────────────────────────────
const NAV_H_PX = 64;
const NAV_H_SHRUNK = 40;

const TABS = [
  { id: 'drives', label: '주행' },
  { id: 'history', label: '이력' },
  { id: 'battery', label: '배터리' },
  { id: 'chargers', label: '집 충전소' },
];

// 각 탭의 핵심 표지 정보 — 누가 봐도 그 탭의 main point
const TAB_DATA = {
  drives: {
    title: '오늘 주행',
    primary: '25.4',
    unit: 'km',
    sub: '1h 12m · 평균 38km/h · 효율 5.8km/kWh',
    accent: '#34d399',
    peekH: 140,
    cover: 'sparkline',
  },
  history: {
    title: '최근 이력',
    primary: '서울→부산',
    unit: '',
    sub: '5월 7일 · 391km · 4h 20m',
    accent: '#a78bfa',
    peekH: 160,
    cover: 'route',
  },
  battery: {
    title: '배터리',
    primary: '78',
    unit: '%',
    sub: '7.2kW 충전 중 · 만충까지 1h 20m',
    accent: '#60a5fa',
    peekH: 180,
    cover: 'ring',
  },
  chargers: {
    title: '집 충전소',
    primary: '96',
    unit: '%',
    sub: '폴링 1분 전 · 정상 · 큐 0',
    accent: '#fbbf24',
    peekH: 120,
    cover: 'status',
  },
};

// ── 표지 데코레이션 ──────────────────────────────────────────
function Sparkline({ accent, big }) {
  const points = [40, 35, 50, 30, 60, 45, 55, 70, 50, 65, 80, 75];
  const max = Math.max(...points);
  return (
    <svg viewBox="0 0 120 30" className={big ? 'w-full h-20' : 'w-full h-8 mt-1'} preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke={accent}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points.map((p, i) => `${i * (120 / (points.length - 1))},${30 - (p / max) * 26}`).join(' ')}
      />
    </svg>
  );
}

function Route({ accent, big }) {
  return (
    <svg viewBox="0 0 120 30" className={big ? 'w-full h-24' : 'w-full h-10 mt-1'} preserveAspectRatio="none">
      <circle cx="10" cy="15" r="3" fill={accent} />
      <path d="M 10 15 Q 40 5 60 18 Q 80 28 110 15" fill="none" stroke={accent} strokeWidth="1.5" strokeDasharray="2,2" />
      <circle cx="110" cy="15" r="3" fill={accent} />
      <text x="10" y="28" fontSize="6" fill="rgba(255,255,255,0.5)">서울</text>
      <text x="100" y="28" fontSize="6" fill="rgba(255,255,255,0.5)">부산</text>
    </svg>
  );
}

function Ring({ accent, value, size }) {
  const r = size === 'lg' ? 36 : 18;
  const c = 2 * Math.PI * r;
  const w = size === 'lg' ? 100 : 50;
  return (
    <svg viewBox={`0 0 ${w} ${w}`} className={size === 'lg' ? 'w-24 h-24' : 'w-12 h-12'}>
      <circle cx={w / 2} cy={w / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={size === 'lg' ? 5 : 3} fill="none" />
      <circle
        cx={w / 2} cy={w / 2} r={r}
        stroke={accent}
        strokeWidth={size === 'lg' ? 5 : 3}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value / 100)}
        transform={`rotate(-90 ${w / 2} ${w / 2})`}
        strokeLinecap="round"
      />
      <text x={w / 2} y={w / 2 + (size === 'lg' ? 6 : 3)} textAnchor="middle" fontSize={size === 'lg' ? 18 : 11} fill="white" fontWeight="bold">
        {value}%
      </text>
    </svg>
  );
}

function StatusLight({ accent }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <div className="w-3 h-3 rounded-full" style={{ background: accent }} />
        <div className="absolute inset-0 w-3 h-3 rounded-full animate-ping opacity-60" style={{ background: accent }} />
      </div>
      <div className="text-[11px] text-zinc-400">실시간 폴링</div>
    </div>
  );
}

function CoverArt({ tabId, big }) {
  const d = TAB_DATA[tabId];
  if (d.cover === 'sparkline') return <Sparkline accent={d.accent} big={big} />;
  if (d.cover === 'route') return <Route accent={d.accent} big={big} />;
  if (d.cover === 'ring') return <Ring accent={d.accent} value={parseInt(d.primary, 10)} size={big ? 'lg' : 'sm'} />;
  if (d.cover === 'status') return <StatusLight accent={d.accent} />;
  return null;
}

// ── Detail (확장 시 추가로 보이는 본문) ──────────────────────
function DetailBody({ tabId }) {
  const d = TAB_DATA[tabId];
  return (
    <div className="px-4 py-3 space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {['7일 평균', '이번 달', '누적'].map((label, i) => (
          <div key={label} className="bg-[#0f0f0f] border border-white/[0.06] rounded-lg p-2.5">
            <div className="text-[10px] text-zinc-500">{label}</div>
            <div className="text-sm font-bold tabular-nums mt-0.5" style={{ color: d.accent }}>
              {(parseFloat(d.primary) * (i + 1.2)).toFixed(1)}
              <span className="text-[10px] text-zinc-500 ml-0.5">{d.unit}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-[#0f0f0f] border border-white/[0.06] rounded-lg p-3">
        <div className="text-[11px] text-zinc-400 font-semibold mb-2">최근 7일 추이</div>
        <Sparkline accent={d.accent} big />
      </div>
      <div className="space-y-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex justify-between items-center py-1.5 border-b border-white/[0.04] text-[12px]">
            <span className="text-zinc-300 tabular-nums">2026-05-{String(8 - i).padStart(2, '0')}</span>
            <span className="text-zinc-500 tabular-nums">{(parseFloat(d.primary) * (1 - i * 0.05)).toFixed(1)} {d.unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── B1: 미니 바 (얇은 1줄, 모든 탭 동일 56px 높이) ───────────
function SheetB1({ tabId, expanded, onTap, onCollapse }) {
  const d = TAB_DATA[tabId];
  const peekH = 56;
  return (
    <>
      {expanded && (
        <div className="fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm" onClick={onCollapse} style={{ animation: 'fadeIn 0.3s' }} />
      )}
      <div
        className="fixed left-0 right-0 z-[60] bg-[#161618] border-t border-white/[0.08] rounded-t-3xl flex flex-col overflow-hidden"
        style={{
          bottom: NAV_H_PX,
          height: expanded ? `calc(100dvh - ${NAV_H_PX}px)` : `${peekH}px`,
          transition: 'height 0.35s cubic-bezier(0.32,0.72,0,1)',
          borderTop: `2px solid ${d.accent}`,
        }}
      >
        <button
          type="button"
          onClick={!expanded ? onTap : onCollapse}
          className="w-full flex items-center justify-between px-4 shrink-0 hover:bg-white/[0.02]"
          style={{ height: peekH }}
        >
          <div className="flex items-center gap-3 text-left">
            <div className="text-[11px] font-bold" style={{ color: d.accent }}>{d.title}</div>
            <div className="text-base tabular-nums">
              <span className="font-bold text-zinc-100">{d.primary}</span>
              {d.unit && <span className="text-zinc-500 text-[11px] ml-0.5">{d.unit}</span>}
            </div>
          </div>
          <div className="text-zinc-500 text-[12px]">{expanded ? '▾' : '▴'}</div>
        </button>
        {expanded && (
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <DetailBody tabId={tabId} />
          </div>
        )}
      </div>
    </>
  );
}

// ── B2: 표지 카드 (탭마다 다른 높이 + 표지 디자인) ──────────
function SheetB2({ tabId, expanded, onTap, onCollapse }) {
  const d = TAB_DATA[tabId];
  return (
    <>
      {expanded && (
        <div className="fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm" onClick={onCollapse} style={{ animation: 'fadeIn 0.3s' }} />
      )}
      <div
        className="fixed left-0 right-0 z-[60] bg-[#161618] border-t border-white/[0.08] rounded-t-3xl flex flex-col overflow-hidden"
        style={{
          bottom: NAV_H_PX,
          height: expanded ? `calc(85dvh - ${NAV_H_PX}px)` : `${d.peekH}px`,
          transition: 'height 0.35s cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: `${d.accent}66` }} />
        </div>
        <button
          type="button"
          onClick={!expanded ? onTap : onCollapse}
          className="w-full text-left px-4 pb-2 shrink-0"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: d.accent }}>
                {d.title}
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-[28px] font-bold text-zinc-100 tabular-nums leading-none">{d.primary}</span>
                {d.unit && <span className="text-sm text-zinc-400">{d.unit}</span>}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1.5">{d.sub}</div>
            </div>
            <div className="shrink-0">
              <CoverArt tabId={tabId} />
            </div>
          </div>
          {!expanded && (
            <div className="text-[10px] text-zinc-600 mt-2 text-right">탭하여 자세히 보기 ▴</div>
          )}
        </button>
        {expanded && (
          <div className="flex-1 overflow-y-auto overscroll-contain border-t border-white/[0.06]">
            <DetailBody tabId={tabId} />
          </div>
        )}
      </div>
    </>
  );
}

// ── B3: 모핑 (peek→expand 시 표지 메트릭이 헤더로 커지고, 내비바 축소) ──
function SheetB3({ tabId, expanded, onTap, onCollapse }) {
  const d = TAB_DATA[tabId];
  const peekH = 100;
  return (
    <>
      {expanded && (
        <div className="fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm" onClick={onCollapse} style={{ animation: 'fadeIn 0.3s' }} />
      )}
      <div
        className="fixed left-0 right-0 z-[60] bg-[#161618] border-t border-white/[0.08] flex flex-col overflow-hidden"
        style={{
          bottom: expanded ? NAV_H_SHRUNK : NAV_H_PX,
          height: expanded ? `calc(100dvh - ${NAV_H_SHRUNK}px)` : `${peekH}px`,
          borderTopLeftRadius: expanded ? 0 : 24,
          borderTopRightRadius: expanded ? 0 : 24,
          transition: 'height 0.4s cubic-bezier(0.32,0.72,0,1), bottom 0.4s cubic-bezier(0.32,0.72,0,1), border-radius 0.3s',
          borderTop: `2px solid ${d.accent}`,
        }}
      >
        {/* 모핑 헤더: 표지 메트릭이 커짐 */}
        <button
          type="button"
          onClick={!expanded ? onTap : onCollapse}
          className="w-full text-left px-4 shrink-0"
          style={{
            paddingTop: expanded ? 24 : 16,
            paddingBottom: expanded ? 20 : 12,
            transition: 'padding 0.35s ease',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: d.accent }}>
                {d.title}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className="font-bold text-zinc-100 tabular-nums leading-none"
                  style={{
                    fontSize: expanded ? 56 : 24,
                    transition: 'font-size 0.35s cubic-bezier(0.32,0.72,0,1)',
                  }}
                >
                  {d.primary}
                </span>
                {d.unit && (
                  <span
                    className="text-zinc-400"
                    style={{
                      fontSize: expanded ? 20 : 12,
                      transition: 'font-size 0.35s ease',
                    }}
                  >
                    {d.unit}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1.5">{d.sub}</div>
            </div>
            <div
              className="shrink-0"
              style={{
                transform: expanded ? 'scale(1.4)' : 'scale(1)',
                transformOrigin: 'top right',
                transition: 'transform 0.35s cubic-bezier(0.32,0.72,0,1)',
                marginRight: expanded ? 16 : 0,
              }}
            >
              <CoverArt tabId={tabId} />
            </div>
          </div>
          {!expanded && (
            <div className="text-[10px] text-zinc-600 mt-1 text-right">탭 = 확장</div>
          )}
        </button>
        {expanded && (
          <div className="flex-1 overflow-y-auto overscroll-contain border-t border-white/[0.06]">
            <DetailBody tabId={tabId} />
          </div>
        )}
      </div>
    </>
  );
}

// ── 목업 내비바 (B3 모드에서만 expanded 시 축소) ─────────────
function MockNav({ tabs, activeId, onTabClick, shrunk }) {
  return (
    <nav
      aria-label="목업 내비바"
      className="fixed bottom-0 left-0 right-0 z-50 bg-[#0f0f0f]/95 backdrop-blur border-t border-white/[0.06]"
      style={{
        height: shrunk ? NAV_H_SHRUNK : NAV_H_PX,
        transition: 'height 0.35s cubic-bezier(0.32,0.72,0,1)',
      }}
    >
      <div className="max-w-2xl mx-auto h-full flex">
        {tabs.map((t) => {
          const isActive = t.id === activeId;
          const data = TAB_DATA[t.id];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabClick(t.id)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5"
              style={{ color: isActive ? data.accent : '#71717a' }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: isActive ? data.accent : 'transparent' }}
              />
              <span
                className="font-semibold"
                style={{
                  fontSize: shrunk ? 9 : 11,
                  transition: 'font-size 0.3s',
                }}
              >
                {t.label}
              </span>
              {!shrunk && (
                <div className="text-[9px] text-zinc-600 tabular-nums">
                  {data.primary}{data.unit}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ── 페이지 ───────────────────────────────────────────────────
const VARIANTS = [
  { id: 'B1', label: '미니바', desc: '얇은 56px 바 · 단일 줄 · 탭마다 표지 텍스트만 다름' },
  { id: 'B2', label: '표지카드', desc: '탭마다 다른 높이(120~180px) + 다른 시각화 (sparkline / 경로 / 링 / 라이트)' },
  { id: 'B3', label: '모핑', desc: '확장 시 표지 메트릭이 거대해지고 + 내비바 축소 (위↑ / 아래↓ 효과 가장 강함)' },
];

export default function SheetCoverMockup() {
  const [variant, setVariant] = useState('B2');
  const [activeTab, setActiveTab] = useState('battery');
  const [expanded, setExpanded] = useState(false);

  // 탭 변경 시 expanded 유지 (콘텐츠만 바뀜) — 실서비스 시나리오 모방
  function onTabClick(id) {
    setActiveTab(id);
  }

  // ESC = collapse
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape' && expanded) setExpanded(false); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [expanded]);

  const SheetComp = variant === 'B1' ? SheetB1 : variant === 'B2' ? SheetB2 : SheetB3;
  const navShrunk = variant === 'B3' && expanded;

  return (
    <main className="min-h-dvh bg-[#0f0f0f] text-zinc-200">
      <style>{`@keyframes fadeIn { from { opacity:0 } to { opacity:1 } }`}</style>

      <div className="max-w-2xl mx-auto px-4 pt-6" style={{ paddingBottom: TAB_DATA[activeTab].peekH + NAV_H_PX + 32 }}>
        <h1 className="text-lg font-bold mb-1">표지(cover) 시트 — 3가지 안</h1>
        <p className="text-[12px] text-zinc-500 mb-4">
          탭 전환 = 표지 정보 변화 · 표지 누르면 확장 · 백드롭/ESC 닫기
        </p>

        {/* Variant 토글 */}
        <div className="rounded-xl bg-[#161618] border border-white/[0.08] p-3 mb-4">
          <div className="text-[11px] text-zinc-400 font-semibold mb-2">변형</div>
          <div className="grid grid-cols-3 gap-1 mb-2">
            {VARIANTS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => { setVariant(v.id); setExpanded(false); }}
                className={`py-2 text-[12px] rounded-md font-semibold transition ${
                  variant === v.id
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                    : 'bg-white/[0.04] text-zinc-400 border border-transparent hover:bg-white/[0.08]'
                }`}
              >
                {v.id}. {v.label}
              </button>
            ))}
          </div>
          <div className="text-[10px] text-zinc-500 leading-relaxed">
            {VARIANTS.find((v) => v.id === variant).desc}
          </div>
        </div>

        {/* "페이지 본문" 더미 — 탭에 따라 바뀌는 가짜 콘텐츠 */}
        <div className="space-y-2">
          <div className="text-[11px] text-zinc-500">현재 페이지: <span className="text-zinc-300 font-semibold">{TAB_DATA[activeTab].title}</span></div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[#161618] border border-white/[0.06] rounded-xl p-4">
              <div className="text-[11px] text-zinc-500">상세 카드 {i + 1}</div>
              <div className="text-[13px] text-zinc-300 mt-1">
                {TAB_DATA[activeTab].title} 관련 콘텐츠 영역 — 표지(시트) 뒤에 보이는 페이지 본문 자리.
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 표지 시트 (3가지 변형 중 하나) */}
      <SheetComp
        tabId={activeTab}
        expanded={expanded}
        onTap={() => setExpanded(true)}
        onCollapse={() => setExpanded(false)}
      />

      {/* 내비바 — B3 + expanded 시 축소 */}
      <MockNav tabs={TABS} activeId={activeTab} onTabClick={onTabClick} shrunk={navShrunk} />
    </main>
  );
}
