'use client';
import { useEffect, useRef, useState } from 'react';

const NAV_H_PX = 64;

// ── 공통 라이프사이클 훅 ─────────────────────────────────────
function useSheetLifecycle(onClose) {
  const [visible, setVisible] = useState(false);
  const closeRef = useRef();
  closeRef.current = () => {
    setVisible(false);
    setTimeout(() => onClose(), 320);
  };
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, []);
  return { visible, close: () => closeRef.current() };
}

// navMode → wrapper z / bottom offset
function modeStyle(navMode) {
  if (navMode === 'above') return { zClass: 'z-40', bottomPx: NAV_H_PX };
  return { zClass: 'z-[60]', bottomPx: 0 };
}

// ── 공통 헤더 ────────────────────────────────────────────────
function SheetHeader({ title, subtitle, onClose, dragHandlers }) {
  return (
    <>
      <div
        {...(dragHandlers || {})}
        className={`flex justify-center pt-2 pb-1 ${dragHandlers ? 'cursor-grab active:cursor-grabbing touch-none' : ''}`}
      >
        <div className="w-10 h-1 rounded-full bg-white/[0.18]" />
      </div>
      <div className="sticky top-0 z-10 bg-[#161618] border-b border-white/[0.06] px-4 py-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-200">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-7 h-7 rounded-md hover:bg-white/[0.06] flex items-center justify-center text-zinc-400 hover:text-zinc-200"
          >
            ✕
          </button>
        </div>
        {subtitle && <div className="text-[10px] text-zinc-500 mt-0.5">{subtitle}</div>}
      </div>
    </>
  );
}

// ── 더미 콘텐츠 ──────────────────────────────────────────────
function DummyContent() {
  const cells = Array.from({ length: 5 * 24 }, (_, i) => {
    const v = (i * 137 + 31) % 100;
    if (v > 92) return 'bg-rose-700';
    if (v > 80) return 'bg-amber-700';
    if (v > 50) return 'bg-emerald-700';
    if (v > 25) return 'bg-emerald-800/70';
    return 'bg-emerald-900/40';
  });
  return (
    <div className="px-4 py-2.5 space-y-3">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-2.5">
        <div className="text-[11px] text-amber-300 font-bold">⚠️ Warm Diag</div>
        <div className="text-[10px] text-zinc-400 mt-1 leading-relaxed">
          최근 폴링 1분 · 성공률 96% · TTL 5분 · 큐 대기 0
        </div>
      </div>
      <div className="flex gap-1 bg-[#1a1a1c] border border-white/[0.06] rounded-md p-0.5">
        <button type="button" className="flex-1 py-1.5 text-[12px] rounded bg-white/[0.08] text-zinc-100">시간별</button>
        <button type="button" className="flex-1 py-1.5 text-[12px] rounded text-zinc-400">일별</button>
      </div>
      <div className="flex items-center justify-between text-[12px]">
        <button type="button" className="px-2 py-1 rounded bg-white/[0.04] text-zinc-300">◀ 이전</button>
        <span className="text-zinc-200 font-semibold tabular-nums">2026-05-08 (오늘)</span>
        <button type="button" className="px-2 py-1 rounded bg-white/[0.04] text-zinc-500 opacity-30">다음 ▶</button>
      </div>
      <div>
        <div className="text-[10px] text-zinc-500 mb-1">히트맵 5×24</div>
        <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
          {cells.map((c, i) => (
            <div key={i} className={`${c} aspect-square rounded-sm`} />
          ))}
        </div>
      </div>
      <div className="space-y-0.5">
        <div className="text-[10px] text-zinc-500 mb-1">최근 14일</div>
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="flex justify-between items-center py-1.5 border-b border-white/[0.04] text-[12px]">
            <span className="text-zinc-300 tabular-nums">2026-05-{String(8 - i).padStart(2, '0')}</span>
            <span className="text-zinc-500 tabular-nums">▓▒░▒▓▒  {95 - (i * 3) % 20}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── A. 표준 ──────────────────────────────────────────────────
function SheetA({ onClose, navMode }) {
  const { visible, close } = useSheetLifecycle(onClose);
  const { zClass, bottomPx } = modeStyle(navMode);
  return (
    <div
      className={`fixed top-0 left-0 right-0 ${zClass} flex items-end justify-center`}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      style={{
        bottom: bottomPx,
        background: visible ? 'rgba(0,0,0,0.6)' : 'transparent',
        transition: 'background 0.3s',
        backdropFilter: visible ? 'blur(4px)' : 'none',
      }}
    >
      <div
        className="w-full max-w-2xl bg-[#161618] border-t border-x border-white/[0.08] rounded-t-3xl max-h-[90dvh] overflow-y-auto overscroll-contain"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <SheetHeader title="A. 표준 바텀시트" subtitle="max-h:90dvh · 슬라이드업" onClose={close} />
        <DummyContent />
      </div>
    </div>
  );
}

// ── B. 스냅 ──────────────────────────────────────────────────
function SheetB({ onClose, navMode }) {
  const { visible, close } = useSheetLifecycle(onClose);
  const { zClass, bottomPx } = modeStyle(navMode);
  const [snap, setSnap] = useState('mid');
  const [drag, setDrag] = useState(null);

  const heights = { mid: '50dvh', full: '90dvh' };
  const dyOffset = drag ? Math.max(-20, drag.dy) : 0;

  const dragHandlers = {
    onPointerDown: (e) => {
      setDrag({ startY: e.clientY, dy: 0 });
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e) => {
      setDrag((d) => (d ? { ...d, dy: e.clientY - d.startY } : null));
    },
    onPointerUp: () => {
      if (!drag) return;
      const dy = drag.dy;
      setDrag(null);
      if (snap === 'full' && dy > 80) setSnap('mid');
      else if (snap === 'mid' && dy > 100) close();
      else if (snap === 'mid' && dy < -60) setSnap('full');
    },
    onPointerCancel: () => setDrag(null),
  };

  return (
    <div
      className={`fixed top-0 left-0 right-0 ${zClass} flex items-end justify-center`}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      style={{
        bottom: bottomPx,
        background: visible ? 'rgba(0,0,0,0.6)' : 'transparent',
        transition: 'background 0.3s',
      }}
    >
      <div
        className="w-full max-w-2xl bg-[#161618] border-t border-x border-white/[0.08] rounded-t-3xl overflow-y-auto overscroll-contain"
        style={{
          height: heights[snap],
          transform: visible ? `translateY(${dyOffset}px)` : 'translateY(100%)',
          transition: drag
            ? 'none'
            : 'transform 0.32s cubic-bezier(0.32,0.72,0,1), height 0.28s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <SheetHeader
          title={`B. 스냅 시트 — ${snap === 'mid' ? '50%' : '90%'}`}
          subtitle="핸들 드래그 = 높이 토글 · 50%에서 더 내리면 닫힘"
          onClose={close}
          dragHandlers={dragHandlers}
        />
        <DummyContent />
      </div>
    </div>
  );
}

// ── C. 하프 ──────────────────────────────────────────────────
function SheetC({ onClose, navMode }) {
  const { visible, close } = useSheetLifecycle(onClose);
  const { zClass, bottomPx } = modeStyle(navMode);
  return (
    <div
      className={`fixed top-0 left-0 right-0 ${zClass} flex items-end justify-center`}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      style={{
        bottom: bottomPx,
        background: visible ? 'rgba(0,0,0,0.4)' : 'transparent',
        transition: 'background 0.3s',
      }}
    >
      <div
        className="w-full max-w-2xl bg-[#161618] border-t border-x border-white/[0.08] rounded-t-3xl h-[50dvh] overflow-y-auto overscroll-contain"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <SheetHeader title="C. 하프시트" subtitle="h:50dvh 고정 · 백드롭 연함" onClose={close} />
        <DummyContent />
      </div>
    </div>
  );
}

// ── D. 플로팅 ────────────────────────────────────────────────
function SheetD({ onClose, navMode }) {
  const { visible, close } = useSheetLifecycle(onClose);
  const { zClass, bottomPx } = modeStyle(navMode);
  return (
    <div
      className={`fixed top-0 left-0 right-0 ${zClass} flex items-end justify-center p-3`}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      style={{
        bottom: bottomPx,
        background: visible ? 'rgba(0,0,0,0.7)' : 'transparent',
        transition: 'background 0.3s',
      }}
    >
      <div
        className="w-full max-w-2xl bg-[#161618] border border-white/[0.08] rounded-3xl shadow-2xl max-h-[75dvh] overflow-y-auto overscroll-contain"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <SheetHeader title="D. 플로팅 카드" subtitle="m-3 · 4면 둥근 · 카드처럼 떠있음" onClose={close} />
        <DummyContent />
      </div>
    </div>
  );
}

// ── E. 풀스크린 드로어 ───────────────────────────────────────
function SheetE({ onClose, navMode }) {
  const { visible, close } = useSheetLifecycle(onClose);
  const { zClass, bottomPx } = modeStyle(navMode);
  const [drag, setDrag] = useState(null);
  const dyOffset = drag ? Math.max(0, drag.dy) : 0;

  const dragHandlers = {
    onPointerDown: (e) => {
      setDrag({ startY: e.clientY, dy: 0 });
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e) => {
      setDrag((d) => (d ? { ...d, dy: e.clientY - d.startY } : null));
    },
    onPointerUp: () => {
      if (!drag) return;
      const dy = drag.dy;
      setDrag(null);
      if (dy > 120) close();
    },
    onPointerCancel: () => setDrag(null),
  };

  return (
    <div
      className={`fixed top-0 left-0 right-0 ${zClass} bg-[#0f0f0f] overflow-y-auto`}
      role="dialog"
      aria-modal="true"
      style={{
        bottom: bottomPx,
        transform: visible ? `translateY(${dyOffset}px)` : 'translateY(100%)',
        transition: drag ? 'none' : 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
      }}
    >
      <div className="max-w-2xl mx-auto">
        <SheetHeader
          title="E. 풀스크린 드로어"
          subtitle="100dvh · 백드롭 없음 · 핸들에서 ↓120px = 닫기"
          onClose={close}
          dragHandlers={dragHandlers}
        />
        <DummyContent />
      </div>
    </div>
  );
}

// ── 목업 내비바 (실제 BottomNavV2 와 동일 외형) ──────────────
function MockNav({ slideDown }) {
  const tabs = [
    {
      label: '주행',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 14l4-4 4 4 5-5" />
        </svg>
      ),
    },
    {
      label: '이력',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0L6.343 16.657a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      label: '배터리',
      active: true,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="7" width="15" height="10" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 11v2" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 9l-2 4h3l-2 4" />
        </svg>
      ),
    },
    {
      label: '집 충전소',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
  ];
  return (
    <nav
      aria-label="목업 하단 탭"
      className="fixed bottom-0 left-0 right-0 z-50 bg-[#0f0f0f]/95 backdrop-blur border-t border-white/[0.06]"
      style={{
        transform: slideDown ? 'translateY(100%)' : 'translateY(0)',
        transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="max-w-2xl mx-auto flex">
        {tabs.map((t) => (
          <div
            key={t.label}
            className={`flex-1 flex flex-col items-center py-2.5 pb-2 gap-1 ${t.active ? 'text-blue-400' : 'text-zinc-600'}`}
          >
            {t.icon}
            <span className="text-[10px] font-semibold">{t.label}</span>
            <span
              className="w-1 h-1 rounded-full"
              style={{ background: t.active ? '#3b82f6' : 'transparent' }}
            />
          </div>
        ))}
      </div>
    </nav>
  );
}

// ── 페이지 ───────────────────────────────────────────────────
const SHEETS = [
  { id: 'A', label: '표준 바텀시트', desc: '90dvh · 슬라이드업' },
  { id: 'B', label: '스냅 (50% ↔ 90%)', desc: '핸들 드래그로 높이 토글' },
  { id: 'C', label: '하프시트', desc: '50dvh 고정 · 위 본문 살짝 보임' },
  { id: 'D', label: '플로팅 카드', desc: '사이드 마진 · 4면 둥금' },
  { id: 'E', label: '풀스크린 드로어', desc: '100dvh · 스와이프 다운 닫기' },
];

const NAV_MODES = [
  {
    id: 'cover',
    label: '덮음',
    desc: '시트가 내비바를 덮음 · z-[60] (현재 RankingsSheet 와 동일)',
  },
  {
    id: 'above',
    label: '위에',
    desc: '시트가 내비바 위에 자리 · 내비바 항상 보이고 탭 가능',
  },
  {
    id: 'slide',
    label: '같이 슬라이드',
    desc: '시트 열면 내비바도 같이 아래로 사라짐',
  },
];

const SHEET_COMPONENTS = { A: SheetA, B: SheetB, C: SheetC, D: SheetD, E: SheetE };

export default function SheetMockupPage() {
  const [open, setOpen] = useState(null);
  const [navMode, setNavMode] = useState('cover');
  const Sheet = open ? SHEET_COMPONENTS[open] : null;

  // 'slide' 모드에서만 시트 열렸을 때 내비바 슬라이드 다운
  const navSlideDown = navMode === 'slide' && !!open;

  return (
    <main className="min-h-dvh bg-[#0f0f0f] text-zinc-200 max-w-2xl mx-auto px-4 py-6 pb-24">
      <h1 className="text-lg font-bold mb-1">바텀시트 5개 안 — 내비바 연동 미리보기</h1>
      <p className="text-[12px] text-zinc-500 mb-4">
        모드 선택 후 시트 버튼 눌러 동작 비교 · ESC / 백드롭 / ✕ 로 닫기
      </p>

      {/* 내비 연동 모드 토글 */}
      <div className="mb-4 rounded-xl bg-[#161618] border border-white/[0.08] p-3">
        <div className="text-[11px] text-zinc-400 font-semibold mb-2">내비바 연동 모드</div>
        <div className="grid grid-cols-3 gap-1 mb-2">
          {NAV_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setNavMode(m.id)}
              className={`py-2 text-[12px] rounded-md font-semibold transition ${
                navMode === m.id
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                  : 'bg-white/[0.04] text-zinc-400 border border-transparent hover:bg-white/[0.08]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="text-[10px] text-zinc-500 leading-relaxed">
          {NAV_MODES.find((m) => m.id === navMode).desc}
        </div>
      </div>

      {/* 시트 버튼 */}
      <div className="space-y-2">
        {SHEETS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setOpen(s.id)}
            className="w-full text-left bg-[#161618] border border-white/[0.08] rounded-xl px-4 py-3 hover:bg-white/[0.04] active:bg-white/[0.06] transition"
          >
            <div className="text-[13px] font-semibold text-zinc-100">{s.id}. {s.label}</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">{s.desc}</div>
          </button>
        ))}
      </div>

      <div className="mt-6 text-[10px] text-zinc-600 leading-relaxed">
        ※ 콘텐츠 / 내비바는 모두 더미 (실제 라우팅 안 됨)<br />
        ※ A·B·C·D 의 &apos;위에&apos; 모드: 내비바 위치는 그대로 + 시트가 내비바 높이만큼 위로 올라옴<br />
        ※ E (풀스크린) 의 &apos;위에&apos; 모드: 시트가 내비바 영역 위까지만 덮음
      </div>

      {Sheet && <Sheet onClose={() => setOpen(null)} navMode={navMode} />}

      {/* 자체 mock 내비바 (실제 BottomNavV2 는 /v2/dev 에서 hide 처리됨) */}
      <MockNav slideDown={navSlideDown} />
    </main>
  );
}
