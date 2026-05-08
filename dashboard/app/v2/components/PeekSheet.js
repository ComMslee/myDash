'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

// ── Context ─────────────────────────────────────────────────
const PeekSheetContext = createContext(null);
export function usePeekSheet() { return useContext(PeekSheetContext); }

// ── 탭 메타 ─────────────────────────────────────────────────
// 3탭(홈/주행/배터리). 이력은 주행 그룹, 집충전소는 배터리 그룹으로 흡수.
// 따라서 /history → drives 표지, /chargers* → battery 표지.
function getActiveTab(pathname) {
  const p = pathname || '';
  if (p === '/home') return 'home';
  if (p === '/drives' || p.startsWith('/drives/') || p === '/history' || p.startsWith('/history/')) return 'drives';
  if (p === '/battery' || p.startsWith('/battery/') || p === '/chargers' || p.startsWith('/chargers/')) return 'battery';
  return null;
}

const TAB_META = {
  home: {
    label: '홈', accent: '#f472b6', accentSoft: 'rgba(244,114,182,0.10)', peekH: 104,
  },
  drives: {
    // 주행 + 이력 흡수 — peek 에 최근 이력 1줄 포함
    label: '주행', accent: '#34d399', accentSoft: 'rgba(52,211,153,0.10)', peekH: 124,
  },
  battery: {
    // 배터리 + 집 충전소 흡수 — peek 에 폴링 상태 1줄 포함
    label: '배터리', accent: '#60a5fa', accentSoft: 'rgba(96,165,250,0.10)', peekH: 152,
  },
};

// 내비바 실제 높이는 BottomNavV2 가 --peek-nav-h CSS 변수로 publish.
// fallback 64px (구형 브라우저/내비 미렌더 시).
const NAV_H_VAR = 'var(--peek-nav-h, 64px)';
const REFRESH_MS = 60_000;

// ── 유틸 ────────────────────────────────────────────────────
function formatDur(min) {
  if (!min) return '0m';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function shortAddr(addr) {
  if (!addr) return '—';
  // "서울특별시 강남구 청담동 ..." → "강남구 청담동" 정도까지
  const m = addr.match(/(\S+(구|군|시))\s+(\S+(동|읍|면|로|길))/);
  if (m) return `${m[1]} ${m[3]}`;
  const parts = addr.split(/[\s,]+/).filter(Boolean);
  return parts.slice(-3).join(' ').slice(0, 24);
}

function relTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  if (diff < 60_000) return '방금';
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

// ── 시각요소 ────────────────────────────────────────────────
function SocRing({ accent, value, size = 80 }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth="5" fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={accent} strokeWidth="5" fill="none"
        strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        strokeLinecap="round"
      />
      <text x={size / 2} y={size / 2 + 5} textAnchor="middle" fontSize={size / 4.5} fill="white" fontWeight="bold">
        {value == null ? '—' : value}
      </text>
      <text x={size / 2} y={size / 2 + 17} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.5)">%</text>
    </svg>
  );
}

// ── 탭별 표지 (Cover) ──────────────────────────────────────
// 타이틀 제거 — 활성 탭 라벨은 내비바가 표시하므로 중복.
function CoverHome({ data }) {
  const drives = data?.drives;
  const battery = data?.battery;
  const chargers = data?.chargers;
  const Row = ({ label, value, hint, hintColor }) => (
    <div className="flex items-baseline gap-2 min-w-0">
      <span className="text-[10px] text-zinc-500 w-10 shrink-0">{label}</span>
      <span className="text-[13px] font-bold text-zinc-100 tabular-nums truncate">
        {value}
      </span>
      {hint && (
        <span className="text-[10px] truncate" style={{ color: hintColor || '#71717a' }}>{hint}</span>
      )}
    </div>
  );
  return (
    <div className="space-y-1">
      <Row
        label="주행"
        value={drives ? `${drives.today_km.toFixed(1)} km` : '—'}
        hint={drives?.today_count ? `${drives.today_count}회 · ${formatDur(drives.today_duration_min)}` : '오늘 없음'}
      />
      <Row
        label="배터리"
        value={battery?.soc != null ? `${battery.soc}%` : '—'}
        hint={battery?.charging ? `⚡ ${battery.charger_power_kw?.toFixed(1) ?? '—'} kW` : null}
        hintColor={battery?.charging ? '#60a5fa' : null}
      />
      <Row
        label="충전소"
        value={chargers?.success_rate_today != null ? `${chargers.success_rate_today}%` : '—'}
        hint={chargers?.is_fresh ? '폴링 정상' : '폴링 오래됨'}
        hintColor={chargers?.is_fresh ? '#fbbf24' : null}
      />
    </div>
  );
}

// 주행 cover — 오늘 주행 + 최근 이력 1줄 (이력 흡수)
function CoverDrives({ data, accent }) {
  const d = data?.drives;
  const lat = data?.history?.latest;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1">
            <span className="text-[26px] font-bold text-zinc-100 tabular-nums leading-none">
              {d ? d.today_km.toFixed(1) : '—'}
            </span>
            <span className="text-sm text-zinc-400">km</span>
            <span className="text-[10px] text-zinc-500 ml-2">오늘</span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            {d?.today_count ? `${d.today_count}회 · ${formatDur(d.today_duration_min)}` : '오늘 주행 없음'}
          </div>
        </div>
      </div>
      {/* 이력 흡수 — 최근 주행 1줄 */}
      <div className="flex items-baseline gap-2 pt-2 border-t border-white/[0.06] min-w-0">
        <span className="text-[10px] text-zinc-500 shrink-0">이력</span>
        <span className="text-[12px] text-zinc-300 truncate">
          {lat ? `${shortAddr(lat.start_addr)} → ${shortAddr(lat.end_addr)}` : '—'}
        </span>
        <span className="text-[10px] text-zinc-500 shrink-0 tabular-nums ml-auto">
          {lat ? `${lat.distance.toFixed(1)}km · ${relTime(lat.start)}` : ''}
        </span>
      </div>
    </div>
  );
}

// 배터리 cover — SOC + 충전 + 충전소 폴링 1줄 (충전소 흡수)
function CoverBattery({ data, accent }) {
  const d = data?.battery;
  const c = data?.chargers;
  const fresh = !!c?.is_fresh;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <SocRing accent={accent} value={d?.soc} size={76} />
        <div className="flex-1 min-w-0">
          {d?.charging ? (
            <>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: accent }} />
                <span className="text-[10px] text-zinc-400">충전 중</span>
              </div>
              <div className="text-[20px] font-bold tabular-nums leading-none mt-0.5" style={{ color: accent }}>
                {d.charger_power_kw != null ? d.charger_power_kw.toFixed(1) : '—'}
                <span className="text-[11px] text-zinc-500 ml-0.5">kW</span>
              </div>
              <div className="text-[10px] text-zinc-500 mt-1">
                세션 +{(d.charge_added_kwh || 0).toFixed(1)} kWh
              </div>
            </>
          ) : (
            <>
              <div className="text-[10px] text-zinc-400">충전 안 함</div>
              <div className="text-[10px] text-zinc-500 mt-1">
                {d?.last_position_at ? `${relTime(d.last_position_at)} 갱신` : '데이터 없음'}
              </div>
            </>
          )}
        </div>
      </div>
      {/* 충전소 흡수 — 폴링 상태 1줄 */}
      <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06] min-w-0">
        <span className="text-[10px] text-zinc-500 shrink-0">충전소</span>
        {fresh && (
          <span className="relative w-2 h-2 shrink-0">
            <span className="absolute inset-0 rounded-full" style={{ background: '#fbbf24' }} />
            <span className="absolute inset-0 rounded-full animate-ping" style={{ background: '#fbbf24', opacity: 0.5 }} />
          </span>
        )}
        <span className="text-[12px] font-semibold tabular-nums" style={{ color: '#fbbf24' }}>
          {c?.success_rate_today != null ? `${c.success_rate_today}%` : '—'}
        </span>
        <span className="text-[10px] text-zinc-500 truncate">
          {c?.is_fresh ? '폴링 정상' : '폴링 오래됨'}
          {c?.ttl_min != null ? ` · TTL ${c.ttl_min}분` : ''}
        </span>
      </div>
    </div>
  );
}

const COVERS = {
  home: CoverHome,
  drives: CoverDrives,
  battery: CoverBattery,
};

// ── 탭별 확장 본문 ─────────────────────────────────────────
// 주행 expanded — 주행 섹션 메뉴 + 이력 메뉴 흡수
function ExpandedDrives({ data }) {
  const nav = useMenuNav();
  const lat = data?.history?.latest;
  const history = data?.history;
  return (
    <div className="px-4 py-3 space-y-1.5">
      <div className="text-[10px] text-zinc-500 px-1 tracking-wide uppercase font-semibold mb-1">
        주행 분석
      </div>
      <MenuItem icon="🚗" label="차량 KPI" sub="누적 거리 · 효율 · 기간별" onClick={() => nav('/drives#kpi')} />
      <MenuItem icon="📈" label="이번달 인사이트" sub="4주 롤링 거리·효율" onClick={() => nav('/drives#insights')} />
      <MenuItem icon="📅" label="연간 히트맵" sub="365일 일별 주행/충전" onClick={() => nav('/drives#year')} />
      <MenuItem icon="📊" label="주행 패턴" sub="시간×요일 히트맵" onClick={() => nav('/drives#patterns')} />
      <MenuItem icon="🏆" label="TOP 50 기록" sub="거리·시간·속도·효율 랭킹" onClick={() => nav('/drives#records')} />
      <MenuItem icon="📆" label="연도별 월간" sub="과거 연도 비교 막대" onClick={() => nav('/drives#monthly')} />
      <MenuItem icon="🌡️" label="계절별 효율" sub="봄·여름·가을·겨울 비교" onClick={() => nav('/drives#seasonal')} />

      <div className="text-[10px] text-zinc-500 px-1 tracking-wide uppercase font-semibold mt-3 mb-1">
        이력 페이지
      </div>
      <MenuItem
        icon="📅"
        label="일자별 주행 목록"
        sub={lat ? `${shortAddr(lat.start_addr)} → ${shortAddr(lat.end_addr)} · ${relTime(lat.start)}` : '월 그룹 → 일 카드'}
        onClick={() => nav('/history')}
      />
      <MenuItem icon="🗺️" label="경로 지도" sub={`이번 주 ${history?.week_count ?? 0}건 · ${(history?.week_km ?? 0).toFixed(1)}km`} onClick={() => nav('/history')} />
      <MenuItem icon="📍" label="자주 가는 곳" sub="지오펜스 도착 빈도 TOP" onClick={() => nav('/history')} />
      <MenuItem icon="🕐" label="오래 머문 곳" sub="체류 시간 누적 (≥10분)" onClick={() => nav('/history')} />
    </div>
  );
}

// 홈 expanded — 주요 페이지 4개 + 부가 sub-page
function ExpandedHome() {
  const nav = useMenuNav();
  return (
    <div className="px-4 py-3 space-y-1.5">
      <div className="text-[10px] text-zinc-500 px-1 tracking-wide uppercase font-semibold mb-1">
        주요 페이지
      </div>
      <MenuItem icon="🚗" label="주행" sub="KPI · 인사이트 · 패턴 · TOP 50" onClick={() => nav('/drives')} />
      <MenuItem icon="🗺️" label="이력" sub="일자별 · 지도 · 자주 가는 곳" onClick={() => nav('/history')} />
      <MenuItem icon="🔋" label="배터리" sub="건강도 · 대기 소모 · 충전 기록" onClick={() => nav('/battery')} />
      <MenuItem icon="⚡" label="집 충전소" sub="실시간 + 통계 + 리포트" onClick={() => nav('/chargers')} />

      <div className="text-[10px] text-zinc-500 px-1 tracking-wide uppercase font-semibold mt-3 mb-1">
        부가
      </div>
      <MenuItem icon="📊" label="활용도 리포트" sub="월별 점유율 · 시간×요일" onClick={() => nav('/chargers/report')} />
      <MenuItem icon="🔧" label="폴링 로그" sub="시간별 / 일별 폴링 성공률" onClick={() => nav('/chargers/poll-log')} />
    </div>
  );
}

// 메뉴 아이템 — 페이지 내 #앵커 또는 sub-route 로 점프 + peek 닫기
function MenuItem({ icon, label, sub, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 bg-[#0f0f0f] border border-white/[0.06] rounded-lg px-3 py-2.5 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors"
    >
      <span className="text-[18px] leading-none shrink-0" aria-hidden>{icon}</span>
      <div className="flex-1 min-w-0 text-left">
        <div className="text-[13px] font-semibold text-zinc-200">{label}</div>
        {sub && <div className="text-[10px] text-zinc-500 mt-0.5 truncate">{sub}</div>}
      </div>
      <span className="text-zinc-600 text-base shrink-0">›</span>
    </button>
  );
}

// 같은 페이지 #앵커면 스크롤, 다른 페이지면 router.push
function useMenuNav() {
  const { close } = usePeekSheet();
  const router = useRouter();
  const pathname = usePathname();
  return (target) => {
    close();
    const [path, hash] = target.split('#');
    const samePage = !path || path === pathname;
    if (samePage && hash) {
      // close 애니메이션(320ms) 끝나기 전 스크롤하면 부드럽게 보임
      requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else if (path) {
      router.push(target);
    }
  };
}

// 배터리 expanded — 배터리 섹션 메뉴 + 집 충전소 메뉴 흡수
function ExpandedBattery({ data }) {
  const nav = useMenuNav();
  const c = data?.chargers;
  return (
    <div className="px-4 py-3 space-y-1.5">
      <div className="text-[10px] text-zinc-500 px-1 tracking-wide uppercase font-semibold mb-1">
        배터리 분석
      </div>
      <MenuItem icon="🩺" label="배터리 건강도" sub="점수·등급 · SOC 분포 · 용량 추이" onClick={() => nav('/battery#health')} />
      <MenuItem icon="🌡️" label="대기 소모" sub="주차 중 SOC 감소 24h 타임라인" onClick={() => nav('/battery#idle')} />
      <MenuItem icon="📅" label="월간 충전" sub="집/외부·완/급속 비율 + 시간×요일" onClick={() => nav('/battery#monthly')} />
      <MenuItem icon="📊" label="시간대 히트맵" sub="시간×요일 충전 패턴" onClick={() => nav('/battery#heatmap')} />
      <MenuItem icon="⚡" label="급속 충전 기록" sub="DC · 슈퍼차저 세션" onClick={() => nav('/battery#fast')} />
      <MenuItem icon="🔌" label="완속 충전 기록" sub="집 · AC 세션" onClick={() => nav('/battery#slow')} />

      <div className="text-[10px] text-zinc-500 px-1 tracking-wide uppercase font-semibold mt-3 mb-1">
        집 충전소
      </div>
      <MenuItem
        icon="🗺️"
        label="실시간 충전기"
        sub={c?.is_fresh ? `폴링 정상 · TTL ${c.ttl_min ?? '—'}분` : '단지별 그리드 + 사용 카운트'}
        onClick={() => nav('/chargers#live')}
      />
      <MenuItem icon="📈" label="단지 통계" sub="TOP 15 사용량 + 시간×요일 히트맵" onClick={() => nav('/chargers#fleet')} />
      <MenuItem icon="📊" label="활용도 리포트" sub="KPI · 월별 추이 · 동별 점유율" onClick={() => nav('/chargers/report')} />
      <MenuItem
        icon="🔧"
        label="폴링 로그"
        sub={c?.success_rate_today != null ? `오늘 성공률 ${c.success_rate_today}%` : '시간별 / 일별 성공률'}
        onClick={() => nav('/chargers/poll-log')}
      />
    </div>
  );
}

const EXPANDED = {
  home: ExpandedHome,
  drives: ExpandedDrives,
  battery: ExpandedBattery,
};

// ── 시트 본체 ──────────────────────────────────────────────
function PeekSheet() {
  const { data, activeTab, expanded, open, close } = usePeekSheet();
  const meta = TAB_META[activeTab];
  const dragRef = useRef({ startY: null });
  const [dragDy, setDragDy] = useState(0);

  function onPointerDown(e) {
    dragRef.current.startY = e.clientY;
    setDragDy(0);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (dragRef.current.startY == null) return;
    setDragDy(e.clientY - dragRef.current.startY);
  }
  function onPointerUp() {
    if (dragRef.current.startY == null) return;
    const dy = dragDy;
    dragRef.current.startY = null;
    setDragDy(0);
    if (!expanded && dy < -32) open();
    else if (expanded && dy > 80) close();
  }

  if (!meta) return null;

  const Cover = COVERS[activeTab];
  const Expanded = EXPANDED[activeTab];

  return (
    <>
      {expanded && (
        <div
          className="fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm"
          onClick={close}
          style={{ animation: 'fadeIn 0.3s' }}
        />
      )}
      <div
        className="fixed left-0 right-0 z-[60] flex justify-center pointer-events-none"
        style={{ bottom: NAV_H_VAR }}
      >
        <div
          className="w-full max-w-2xl bg-[#161618] border-t border-x border-white/[0.08] rounded-t-3xl flex flex-col overflow-hidden pointer-events-auto"
          style={{
            height: expanded ? `calc(85dvh - ${NAV_H_VAR})` : meta.peekH,
            transform: expanded
              ? `translateY(${Math.max(0, dragDy)}px)`
              : `translateY(${Math.min(0, Math.max(-12, dragDy / 4))}px)`,
            transition: dragRef.current.startY != null
              ? 'none'
              : 'height 0.4s cubic-bezier(0.32,0.72,0,1), transform 0.32s cubic-bezier(0.32,0.72,0,1)',
            borderTop: `2px solid ${meta.accent}`,
            boxShadow: '0 -12px 32px rgba(0,0,0,0.4)',
          }}
        >
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { dragRef.current.startY = null; setDragDy(0); }}
            onClick={() => { if (Math.abs(dragDy) < 4) (expanded ? close() : open()); }}
            className="shrink-0 cursor-pointer touch-none select-none"
            style={{ background: meta.accentSoft }}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: `${meta.accent}88` }} />
            </div>
            <div className="px-4 pb-2.5" key={activeTab} style={{ animation: 'peek-coverIn 0.32s' }}>
              {Cover && <Cover data={data} accent={meta.accent} />}
            </div>
          </div>
          {expanded && Expanded && (
            <div className="flex-1 overflow-y-auto overscroll-contain border-t border-white/[0.06]">
              <Expanded data={data} accent={meta.accent} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Provider ───────────────────────────────────────────────
export function PeekSheetProvider({ children }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const pathname = usePathname() || '';
  const activeTab = getActiveTab(pathname);

  // 활성 탭의 peek 높이를 CSS 변수로 publish — 페이지 본문 padding-bottom 계산용
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const meta = activeTab ? TAB_META[activeTab] : null;
    if (meta) {
      document.documentElement.style.setProperty('--peek-h', `${meta.peekH}px`);
    } else {
      document.documentElement.style.removeProperty('--peek-h');
    }
    return () => { document.documentElement.style.removeProperty('--peek-h'); };
  }, [activeTab]);

  // 데이터 fetch + 주기 갱신
  useEffect(() => {
    let alive = true;
    let timer = null;
    async function fetchData() {
      try {
        const res = await fetch('/api/v2/quick-status', { cache: 'no-store' });
        const j = await res.json();
        if (!alive) return;
        if (j.error) setError(j.error);
        else { setData(j); setError(null); }
      } catch (e) {
        if (alive) setError(e.message || 'fetch 실패');
      }
    }
    fetchData();
    function onVis() { if (!document.hidden) fetchData(); }
    document.addEventListener('visibilitychange', onVis);
    timer = setInterval(fetchData, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // expanded 시 ESC + body scroll lock
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e) => { if (e.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  // 탭 전환 시 자동 닫힘
  useEffect(() => { setExpanded(false); }, [activeTab]);

  const ctx = {
    data,
    error,
    activeTab,
    expanded,
    open: () => setExpanded(true),
    close: () => setExpanded(false),
    tabMeta: TAB_META,
  };

  // 키프레임 (peek-coverIn / fadeIn) 은 globals.css 에 정의됨

  return (
    <PeekSheetContext.Provider value={ctx}>
      {children}
      {activeTab && <PeekSheet />}
    </PeekSheetContext.Provider>
  );
}
