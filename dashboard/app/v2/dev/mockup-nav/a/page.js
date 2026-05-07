'use client';

// 목업 A — Floating Dock (Mac Dock / iOS Safari 하단 툴바 스타일)
// 페이지 위에 떠있는 반투명 알약 dock. 4 상시 + ⋯ 탭으로 5 펼침.

import { useState } from 'react';
import Link from 'next/link';

const ICON = {
  drives: '🚗', history: '📜', battery: '🔋', chargers: '⚡',
  spotify: '🎵', tg: '✈️', 'api-status': '🔧', 'spotify-relogin': '🔄', auth: '🔐',
};
const LABEL = {
  drives: '주행', history: '이력', battery: '배터리', chargers: '집충전소',
  spotify: '음악', tg: '텔레그램', 'api-status': 'API상태', 'spotify-relogin': '재인증', auth: '인증',
};

const PRIMARY = ['drives', 'history', 'battery', 'spotify'];
const SECONDARY = ['chargers', 'tg', 'api-status', 'spotify-relogin', 'auth'];

export default function MockA() {
  const [active, setActive] = useState('battery');
  const [more, setMore] = useState(false);

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 pt-5 pb-32 flex flex-col gap-4">
        <BackBar />
        <FakeContent active={active} />
      </div>

      {/* 펼침 시트 */}
      {more && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-[fadeIn_120ms_ease-out]"
            onClick={() => setMore(false)}
          />
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 grid grid-cols-3 gap-2 p-3 bg-[#161618]/95 backdrop-blur-xl border border-white/[0.08] rounded-3xl shadow-2xl animate-[slideUp_180ms_ease-out]">
            {SECONDARY.map(k => (
              <button
                key={k}
                onClick={() => { setActive(k); setMore(false); }}
                className={`flex flex-col items-center gap-1 w-20 px-2 py-3 rounded-2xl transition-colors ${
                  active === k ? 'bg-blue-500/[0.15]' : 'hover:bg-white/[0.04]'
                }`}
              >
                <span className="text-2xl leading-none">{ICON[k]}</span>
                <span className={`text-[10px] font-semibold ${active === k ? 'text-blue-400' : 'text-zinc-300'}`}>{LABEL[k]}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Floating Dock */}
      <nav
        className="fixed left-1/2 -translate-x-1/2 z-50 bg-[#161618]/75 backdrop-blur-xl border border-white/[0.10] rounded-full shadow-2xl px-2 py-2"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
      >
        <div className="flex items-center gap-0.5">
          {PRIMARY.map(k => {
            const isActive = active === k;
            return (
              <button
                key={k}
                onClick={() => { setActive(k); setMore(false); }}
                className={`flex flex-col items-center gap-0.5 w-14 py-1.5 rounded-full transition-all ${
                  isActive ? 'bg-blue-500/[0.18] scale-105' : ''
                }`}
              >
                <span className="text-xl leading-none">{ICON[k]}</span>
                <span className={`text-[9px] font-semibold ${isActive ? 'text-blue-400' : 'text-zinc-400'}`}>{LABEL[k]}</span>
              </button>
            );
          })}
          <div className="w-px h-8 bg-white/[0.10] mx-0.5" />
          <button
            onClick={() => setMore(o => !o)}
            className={`flex flex-col items-center gap-0.5 w-14 py-1.5 rounded-full transition-all ${
              more ? 'bg-white/[0.08]' : ''
            }`}
          >
            <span className="text-xl leading-none">⋯</span>
            <span className="text-[9px] font-semibold text-zinc-400">더보기</span>
          </button>
        </div>
      </nav>

      <DebugChip label="A. Floating Dock" active={active} />
    </main>
  );
}

function BackBar() {
  return (
    <Link href="/v2/dev/mockup-nav" className="text-xs text-zinc-500 hover:text-zinc-300 -mb-1">
      ← 비교 인덱스로
    </Link>
  );
}

function FakeContent({ active }) {
  return (
    <>
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-5">
        <div className="text-xs text-zinc-500 mb-2">현재 화면 — {LABEL[active]} (가상)</div>
        <div className="text-4xl font-bold">86<span className="text-xl text-zinc-400">%</span></div>
        <div className="text-xs text-zinc-500 mt-1">12개월 추세 ▼ 1.2%</div>
      </div>
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-5">
        <div className="text-xs text-zinc-500 mb-2">유휴 방전</div>
        <div className="text-2xl font-bold">0.4 <span className="text-sm text-zinc-400">%/일</span></div>
        <div className="grid grid-cols-7 gap-1 mt-3">
          {Array.from({ length: 28 }).map((_, i) => (
            <div key={i} className="h-3 rounded-sm" style={{ background: `rgba(96,165,250,${0.15 + (i % 4) * 0.15})` }} />
          ))}
        </div>
      </div>
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-5">
        <div className="text-xs text-zinc-500 mb-2">최근 충전</div>
        <div className="space-y-2">
          {['12/05 · 집 21→80%', '12/04 · 슈퍼차저 30→78%', '12/02 · 집 45→90%'].map(t => (
            <div key={t} className="text-sm text-zinc-300">{t}</div>
          ))}
        </div>
      </div>
    </>
  );
}

function DebugChip({ label, active }) {
  return (
    <div className="fixed top-3 right-3 z-30 bg-black/70 backdrop-blur px-2.5 py-1 rounded-full text-[10px] text-zinc-400 border border-white/[0.06]">
      {label} · 활성: <span className="text-blue-400 font-bold">{LABEL[active]}</span>
    </div>
  );
}
