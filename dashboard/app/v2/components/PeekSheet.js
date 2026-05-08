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
  // home 은 peek 를 띄우지 않음 — getActiveTab 에서 'home' 도 매핑하지만
  // PeekSheet 본체가 home 일 때 null 반환. 이 객체는 메타데이터(BottomNav 색상) 용도.
  home: {
    label: '홈', accent: '#f472b6', accentSoft: 'rgba(244,114,182,0.10)', peekH: 0,
  },
  drives: {
    // 주행 + 이력 흡수 — peek 에 최근 이력 1줄 포함
    label: '주행', accent: '#34d399', accentSoft: 'rgba(52,211,153,0.10)', peekH: 100,
  },
  battery: {
    // 배터리 + 집 충전소 흡수 — peek 에 폴링 상태 1줄 포함
    label: '배터리', accent: '#60a5fa', accentSoft: 'rgba(96,165,250,0.10)', peekH: 130,
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
// home 탭은 peek 가 안 뜨므로 CoverHome 없음. drives + battery 만 정의.

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

// home 은 peek 가 안 뜨므로 cover 불필요. drives/battery 만.
const COVERS = {
  drives: CoverDrives,
  battery: CoverBattery,
};

// ── 탭별 확장 본문 ─────────────────────────────────────────
// 정보 카드(InfoCard) 형태 — 단순 메뉴 라벨이 아니라 실제 데이터 표시,
// 카드 전체가 클릭 가능 → 관련 페이지/섹션으로 이동.

function InfoCard({ onClick, children, accent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-[#0f0f0f] border border-white/[0.06] rounded-xl px-4 py-3 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors"
      style={accent ? { borderLeft: `2px solid ${accent}` } : undefined}
    >
      {children}
    </button>
  );
}

function ChipBtn({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] px-2.5 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] text-zinc-300 border border-white/[0.06] transition-colors"
    >
      {children}
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
      requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else if (path) {
      router.push(target);
    }
  };
}

// 주행 expanded — 정보 카드 + 칩 (단순 메뉴 X)
function ExpandedDrives({ data }) {
  const nav = useMenuNav();
  const d = data?.drives;
  const h = data?.history;
  const lat = h?.latest;
  const accent = '#34d399';

  return (
    <div className="px-4 py-3 space-y-2.5">
      {/* 오늘 주행 큰 카드 */}
      <InfoCard onClick={() => nav('/drives#kpi')} accent={accent}>
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">오늘 주행</div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-[28px] font-bold tabular-nums leading-none" style={{ color: accent }}>
                {d ? d.today_km.toFixed(1) : '—'}
              </span>
              <span className="text-sm text-zinc-400">km</span>
            </div>
            <div className="text-[11px] text-zinc-500 mt-1.5">
              {d?.today_count
                ? `${d.today_count}회 · ${formatDur(d.today_duration_min)}`
                : '오늘 주행 없음'}
            </div>
          </div>
          <span className="text-zinc-600 text-base shrink-0 self-center">›</span>
        </div>
      </InfoCard>

      {/* 이번 주 인사이트 카드 */}
      <InfoCard onClick={() => nav('/drives#insights')} accent={accent}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-5">
            <div>
              <div className="text-[9px] text-zinc-500 uppercase tracking-wide">이번 주</div>
              <div className="text-[16px] font-bold text-zinc-100 tabular-nums leading-none mt-0.5">
                {h?.week_count ?? 0}<span className="text-[10px] text-zinc-500 ml-0.5">건</span>
              </div>
            </div>
            <div className="w-px h-8 bg-white/[0.06]" />
            <div>
              <div className="text-[9px] text-zinc-500 uppercase tracking-wide">거리</div>
              <div className="text-[16px] font-bold text-zinc-100 tabular-nums leading-none mt-0.5">
                {(h?.week_km ?? 0).toFixed(1)}<span className="text-[10px] text-zinc-500 ml-0.5">km</span>
              </div>
            </div>
          </div>
          <span className="text-zinc-600 text-base shrink-0">›</span>
        </div>
      </InfoCard>

      {/* 최근 주행 (이력) 카드 */}
      {lat && (
        <InfoCard onClick={() => nav('/history')} accent="#a78bfa">
          <div className="flex items-baseline justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold flex items-center gap-1">
                🗺️ 최근 주행
              </div>
              <div className="text-[14px] font-bold text-zinc-100 mt-0.5 truncate">
                {shortAddr(lat.start_addr)} → {shortAddr(lat.end_addr)}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1 tabular-nums truncate">
                {lat.distance.toFixed(1)}km · {formatDur(lat.duration_min)} · {relTime(lat.start)}
              </div>
            </div>
            <span className="text-zinc-600 text-base shrink-0">›</span>
          </div>
        </InfoCard>
      )}

      {/* 더보기 칩 — 세부 페이지 섹션으로 점프 */}
      <div className="pt-1">
        <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-2 px-1">
          분석 / 이력 더보기
        </div>
        <div className="flex flex-wrap gap-1.5">
          <ChipBtn onClick={() => nav('/drives#year')}>📅 연간 히트맵</ChipBtn>
          <ChipBtn onClick={() => nav('/drives#patterns')}>📊 시간×요일</ChipBtn>
          <ChipBtn onClick={() => nav('/drives#records')}>🏆 TOP 50</ChipBtn>
          <ChipBtn onClick={() => nav('/drives#monthly')}>📆 월간</ChipBtn>
          <ChipBtn onClick={() => nav('/drives#seasonal')}>🌡️ 계절별</ChipBtn>
          <ChipBtn onClick={() => nav('/history')}>📍 자주 가는 곳</ChipBtn>
          <ChipBtn onClick={() => nav('/history')}>🕐 오래 머문 곳</ChipBtn>
        </div>
      </div>
    </div>
  );
}

// 배터리 expanded — 정보 카드 + 칩 (집충전소 흡수)
function ExpandedBattery({ data }) {
  const nav = useMenuNav();
  const b = data?.battery;
  const c = data?.chargers;
  const accent = '#60a5fa';
  const chAccent = '#fbbf24';

  return (
    <div className="px-4 py-3 space-y-2.5">
      {/* 배터리 큰 카드 */}
      <InfoCard onClick={() => nav('/battery#health')} accent={accent}>
        <div className="flex items-center gap-3">
          <SocRing accent={accent} value={b?.soc} size={88} />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
              {b?.charging ? '충전 중' : '배터리'}
            </div>
            {b?.charging ? (
              <>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-[24px] font-bold tabular-nums leading-none" style={{ color: accent }}>
                    {b.charger_power_kw != null ? b.charger_power_kw.toFixed(1) : '—'}
                  </span>
                  <span className="text-sm text-zinc-400">kW</span>
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">
                  세션 +{(b.charge_added_kwh || 0).toFixed(1)} kWh
                </div>
              </>
            ) : (
              <>
                <div className="text-[11px] text-zinc-400 mt-1">
                  {b?.last_position_at ? `${relTime(b.last_position_at)} 갱신` : '데이터 없음'}
                </div>
                <div className="text-[10px] text-zinc-500 mt-1">
                  탭하면 건강도 자세히 보기
                </div>
              </>
            )}
          </div>
          <span className="text-zinc-600 text-base shrink-0 self-center">›</span>
        </div>
      </InfoCard>

      {/* 폴링 / 집 충전소 카드 */}
      <InfoCard onClick={() => nav('/chargers#live')} accent={chAccent}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: chAccent }} />
              {c?.is_fresh && (
                <div className="absolute inset-0 w-2.5 h-2.5 rounded-full animate-ping" style={{ background: chAccent, opacity: 0.6 }} />
              )}
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">집 충전소</div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-[18px] font-bold tabular-nums leading-none" style={{ color: chAccent }}>
                  {c?.success_rate_today != null ? `${c.success_rate_today}%` : '—'}
                </span>
                <span className="text-[11px] text-zinc-400">
                  {c?.is_fresh ? '폴링 정상' : '폴링 오래됨'}
                </span>
              </div>
              <div className="text-[10px] text-zinc-500 mt-1 tabular-nums">
                TTL {c?.ttl_min ?? '—'}분
                {c?.last_fetched ? ` · ${relTime(c.last_fetched)}` : ''}
              </div>
            </div>
          </div>
          <span className="text-zinc-600 text-base shrink-0">›</span>
        </div>
      </InfoCard>

      {/* 더보기 칩 — 배터리 + 집충전소 섹션 */}
      <div className="pt-1">
        <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-2 px-1">
          배터리 분석
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          <ChipBtn onClick={() => nav('/battery#idle')}>🌡️ 대기 소모</ChipBtn>
          <ChipBtn onClick={() => nav('/battery#monthly')}>📅 월간 충전</ChipBtn>
          <ChipBtn onClick={() => nav('/battery#heatmap')}>📊 시간대 히트맵</ChipBtn>
          <ChipBtn onClick={() => nav('/battery#fast')}>⚡ 급속</ChipBtn>
          <ChipBtn onClick={() => nav('/battery#slow')}>🔌 완속</ChipBtn>
        </div>
        <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-2 px-1">
          집 충전소
        </div>
        <div className="flex flex-wrap gap-1.5">
          <ChipBtn onClick={() => nav('/chargers#fleet')}>📈 단지 통계</ChipBtn>
          <ChipBtn onClick={() => nav('/chargers/report')}>📊 활용도 리포트</ChipBtn>
          <ChipBtn onClick={() => nav('/chargers/poll-log')}>🔧 폴링 로그</ChipBtn>
        </div>
      </div>
    </div>
  );
}

// home 은 peek 가 안 뜨므로 등록 불필요. drives/battery 만.
const EXPANDED = {
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

  // 홈 탭은 peek 를 띄우지 않음 — 페이지 자체가 요약 역할
  if (!meta || activeTab === 'home') return null;

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
