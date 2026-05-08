'use client';
import { useEffect, useRef, useState } from 'react';

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

// ── 더미 콘텐츠 (폴링 로그 모방) ───────────────────────────
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
function SheetA({ onClose }) {
  const { visible, close } = useSheetLifecycle(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      style={{
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

// ── B. 스냅 (50% ↔ 90%, 핸들 드래그) ─────────────────────────
function SheetB({ onClose }) {
  const { visible, close } = useSheetLifecycle(onClose);
  const [snap, setSnap] = useState('mid'); // 'mid' | 'full'
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
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      style={{
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
          subtitle="핸들 잡고 위/아래 드래그 = 높이 토글 · 50%에서 더 내리면 닫힘"
          onClose={close}
          dragHandlers={dragHandlers}
        />
        <DummyContent />
      </div>
    </div>
  );
}

// ── C. 하프시트 (50dvh 고정) ─────────────────────────────────
function SheetC({ onClose }) {
  const { visible, close } = useSheetLifecycle(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      style={{
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
        <SheetHeader title="C. 하프시트" subtitle="h:50dvh 고정 · 백드롭 연함 → 위 본문 살짝 보임" onClose={close} />
        <DummyContent />
      </div>
    </div>
  );
}

// ── D. 플로팅 카드 (사이드 마진 + 4면 둥금) ─────────────────
function SheetD({ onClose }) {
  const { visible, close } = useSheetLifecycle(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-3"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      style={{
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
        <SheetHeader title="D. 플로팅 카드" subtitle="m-3 · 4면 둥근 모서리 · 카드처럼 떠있음" onClose={close} />
        <DummyContent />
      </div>
    </div>
  );
}

// ── E. 풀스크린 드로어 (스와이프 다운 닫기) ─────────────────
function SheetE({ onClose }) {
  const { visible, close } = useSheetLifecycle(onClose);
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
      className="fixed inset-0 z-50 bg-[#0f0f0f] overflow-y-auto"
      role="dialog"
      aria-modal="true"
      style={{
        transform: visible ? `translateY(${dyOffset}px)` : 'translateY(100%)',
        transition: drag ? 'none' : 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
      }}
    >
      <div className="max-w-2xl mx-auto">
        <SheetHeader
          title="E. 풀스크린 드로어"
          subtitle="100dvh · 백드롭 없음 · 핸들 잡고 아래로 120px = 닫기"
          onClose={close}
          dragHandlers={dragHandlers}
        />
        <DummyContent />
      </div>
    </div>
  );
}

// ── 페이지 ───────────────────────────────────────────────────
const SHEETS = [
  { id: 'A', label: '표준 바텀시트', desc: '90dvh · 슬라이드업', color: 'border-emerald-500/30' },
  { id: 'B', label: '스냅 (50% ↔ 90%)', desc: '핸들 드래그로 높이 토글', color: 'border-sky-500/30' },
  { id: 'C', label: '하프시트', desc: '50dvh 고정 · 위 본문 살짝 보임', color: 'border-violet-500/30' },
  { id: 'D', label: '플로팅 카드', desc: '사이드 마진 · 4면 둥금', color: 'border-amber-500/30' },
  { id: 'E', label: '풀스크린 드로어', desc: '100dvh · 스와이프 다운 닫기', color: 'border-rose-500/30' },
];

const SHEET_COMPONENTS = { A: SheetA, B: SheetB, C: SheetC, D: SheetD, E: SheetE };

export default function SheetMockupPage() {
  const [open, setOpen] = useState(null);
  const Sheet = open ? SHEET_COMPONENTS[open] : null;

  return (
    <main className="min-h-dvh bg-[#0f0f0f] text-zinc-200 max-w-2xl mx-auto px-4 py-6 pb-24">
      <h1 className="text-lg font-bold mb-1">바텀시트 5개 안 — 동작 미리보기</h1>
      <p className="text-[12px] text-zinc-500 mb-4">탭해서 동작 확인 · ESC / 백드롭 / ✕ 로 닫기 · B·E 는 핸들 드래그 가능</p>

      <div className="space-y-2">
        {SHEETS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setOpen(s.id)}
            className={`w-full text-left bg-[#161618] border ${s.color} rounded-xl px-4 py-3 hover:bg-white/[0.04] active:bg-white/[0.06] transition`}
          >
            <div className="text-[13px] font-semibold text-zinc-100">{s.id}. {s.label}</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">{s.desc}</div>
          </button>
        ))}
      </div>

      <div className="mt-6 text-[10px] text-zinc-600 leading-relaxed">
        ※ 콘텐츠는 폴링 로그 페이지를 모방한 더미. 실제 데이터/로직 연결 안 됨.<br />
        ※ A 안이 현재 RankingsSheet 와 동일 패턴 (가장 단순).
      </div>

      {Sheet && <Sheet onClose={() => setOpen(null)} />}
    </main>
  );
}
