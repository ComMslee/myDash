'use client';

// 목업 AB — Floating Dock + Radial Overflow (A+B 믹스)
// 4 primary 는 A 의 알약 dock, ⋯ 누르면 평면 시트 대신 B 의 부채꼴 폭발.

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

const RADIUS = 110;

export default function MockAB() {
  const [active, setActive] = useState('battery');
  const [more, setMore] = useState(false);

  const N = SECONDARY.length;

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 pt-5 pb-32 flex flex-col gap-4">
        <Link href="/v2/dev/mockup-nav" className="text-xs text-zinc-500 hover:text-zinc-300 -mb-1">
          ← 비교 인덱스로
        </Link>
        <FakeContent active={active} />
      </div>

      {/* Backdrop when fan open */}
      {more && (
        <div
          className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm animate-[fadeIn_120ms_ease-out]"
          onClick={() => setMore(false)}
        />
      )}

      {/* Floating Dock + Radial overflow — dock 알약을 anchor 로 잡고 ⋯ 위치에서 부채꼴 펼침 */}
      <div
        className="fixed left-1/2 -translate-x-1/2 z-50"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
      >
        {/* Dock pill */}
        <nav
          aria-label="네비게이션"
          className="bg-[#161618]/75 backdrop-blur-xl border border-white/[0.10] rounded-full shadow-2xl px-2 py-2"
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
            {/* ⋯ overflow trigger — 부채꼴 anchor */}
            <div className="relative">
              <button
                onClick={() => setMore(o => !o)}
                aria-expanded={more}
                aria-label="더보기 메뉴"
                className={`flex flex-col items-center gap-0.5 w-14 py-1.5 rounded-full transition-all ${
                  more ? 'bg-blue-500/[0.18] scale-105' : ''
                }`}
              >
                <span
                  className={`text-xl leading-none transition-transform duration-300 ${more ? 'rotate-90' : ''}`}
                >
                  ⋯
                </span>
                <span className={`text-[9px] font-semibold ${more ? 'text-blue-400' : 'text-zinc-400'}`}>더보기</span>
              </button>

              {/* 부채꼴 — ⋯ 버튼 위쪽으로 quarter-arc 펼침 (90° 위 ~ 180° 왼쪽) */}
              {SECONDARY.map((k, i) => {
                // 90° (위) ~ 180° (왼쪽) 사이 균등 분할
                const angle = 90 + (i * 90) / (N - 1);
                const rad = (angle * Math.PI) / 180;
                const dx = RADIUS * Math.cos(rad); // 0 → -R
                const dy = -RADIUS * Math.sin(rad); // -R → 0 (CSS y 반전)

                const isActive = active === k;
                return (
                  <button
                    key={k}
                    onClick={() => { setActive(k); setMore(false); }}
                    className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-[#161618] border flex items-center justify-center shadow-xl ${
                      isActive ? 'border-blue-500/60 bg-blue-500/[0.15]' : 'border-white/[0.10]'
                    }`}
                    style={{
                      transform: more
                        ? `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)`
                        : 'translate(-50%, -50%) scale(0.3)',
                      opacity: more ? 1 : 0,
                      pointerEvents: more ? 'auto' : 'none',
                      transitionProperty: 'transform, opacity',
                      transitionDuration: '320ms',
                      transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                      transitionDelay: more ? `${i * 30}ms` : `${(N - 1 - i) * 18}ms`,
                    }}
                  >
                    <span className="text-xl leading-none">{ICON[k]}</span>
                    {more && (
                      <span className="absolute -bottom-5 text-[9px] text-zinc-300 whitespace-nowrap font-semibold">
                        {LABEL[k]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>
      </div>

      <DebugChip active={active} />
    </main>
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
      <div className="text-center text-xs text-zinc-600 mt-4">
        하단 dock — 4 상시 + ⋯ 누르면 부채꼴로 5 더 펼침
      </div>
    </>
  );
}

function DebugChip({ active }) {
  return (
    <div className="fixed top-3 right-3 z-30 bg-black/70 backdrop-blur px-2.5 py-1 rounded-full text-[10px] text-zinc-400 border border-white/[0.06]">
      AB 믹스 · 활성: <span className="text-blue-400 font-bold">{LABEL[active]}</span>
    </div>
  );
}
