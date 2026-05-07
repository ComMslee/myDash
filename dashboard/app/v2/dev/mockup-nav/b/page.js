'use client';

// 목업 B — Radial FAB (우하단 + 버튼 → 9 부채꼴 폭발)
// 평상시 화면 점유 0%, FAB 1개. 탭 시 quarter-circle 로 9 도메인 펼침.

import { useState } from 'react';
import Link from 'next/link';

const DOMAINS = [
  { key: 'drives', label: '주행', icon: '🚗' },
  { key: 'history', label: '이력', icon: '📜' },
  { key: 'battery', label: '배터리', icon: '🔋' },
  { key: 'chargers', label: '집충전소', icon: '⚡' },
  { key: 'spotify', label: '음악', icon: '🎵' },
  { key: 'tg', label: '텔레그램', icon: '✈️' },
  { key: 'api-status', label: 'API상태', icon: '🔧' },
  { key: 'spotify-relogin', label: '재인증', icon: '🔄' },
  { key: 'auth', label: '인증', icon: '🔐' },
];

const RADIUS = 130;

export default function MockB() {
  const [active, setActive] = useState('battery');
  const [open, setOpen] = useState(false);

  const N = DOMAINS.length;

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 pt-5 pb-24 flex flex-col gap-4">
        <Link href="/v2/dev/mockup-nav" className="text-xs text-zinc-500 hover:text-zinc-300 -mb-1">
          ← 비교 인덱스로
        </Link>
        <FakeContent active={active} />
      </div>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm animate-[fadeIn_120ms_ease-out]"
          onClick={() => setOpen(false)}
        />
      )}

      {/* FAB + 부채꼴 */}
      <div className="fixed z-50" style={{ right: 24, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
        {/* 부채꼴 도메인 — FAB 위/왼쪽 quarter-circle */}
        {DOMAINS.map((d, i) => {
          // 90° (위) 부터 180° (왼쪽) 까지 9 등분
          const angle = 90 + (i * 90) / (N - 1);
          const rad = (angle * Math.PI) / 180;
          const dx = RADIUS * Math.cos(rad); // 90°: 0, 180°: -R
          const dy = -RADIUS * Math.sin(rad); // 90°: -R, 180°: 0 (CSS y 반전)

          return (
            <button
              key={d.key}
              onClick={() => { setActive(d.key); setOpen(false); }}
              className={`absolute right-1 bottom-1 w-12 h-12 rounded-full bg-[#161618] border flex items-center justify-center shadow-xl transition-all ${
                active === d.key
                  ? 'border-blue-500/60 bg-blue-500/[0.12]'
                  : 'border-white/[0.10]'
              }`}
              style={{
                transform: open ? `translate(${dx}px, ${dy}px) scale(1)` : 'translate(0, 0) scale(0.3)',
                opacity: open ? 1 : 0,
                pointerEvents: open ? 'auto' : 'none',
                transitionDuration: '320ms',
                transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                transitionDelay: open ? `${i * 25}ms` : `${(N - 1 - i) * 15}ms`,
              }}
            >
              <span className="text-xl leading-none">{d.icon}</span>
              {open && (
                <span className="absolute -bottom-5 text-[9px] text-zinc-300 whitespace-nowrap font-semibold">
                  {d.label}
                </span>
              )}
            </button>
          );
        })}

        {/* FAB */}
        <button
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-label="네비게이션 메뉴"
          className={`relative w-14 h-14 rounded-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 flex items-center justify-center shadow-2xl transition-transform duration-300 ${
            open ? 'rotate-45 scale-95' : 'scale-100'
          }`}
        >
          <span className="text-3xl text-white leading-none font-light">+</span>
        </button>

        {/* 첫 사용자 힌트 — 평상시 작은 펄스 */}
        {!open && (
          <span className="absolute -inset-1 rounded-full bg-blue-500/30 animate-ping pointer-events-none" />
        )}
      </div>

      <DebugChip label="B. Radial FAB" active={active} />
    </main>
  );
}

function FakeContent({ active }) {
  const d = DOMAINS.find(x => x.key === active) || DOMAINS[2];
  return (
    <>
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-5">
        <div className="text-xs text-zinc-500 mb-2">현재 화면 — {d.label} (가상)</div>
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
        우하단 + 버튼 → 9 도메인 펼침
      </div>
    </>
  );
}

function DebugChip({ label, active }) {
  const d = DOMAINS.find(x => x.key === active);
  return (
    <div className="fixed top-3 right-3 z-30 bg-black/70 backdrop-blur px-2.5 py-1 rounded-full text-[10px] text-zinc-400 border border-white/[0.06]">
      {label} · 활성: <span className="text-blue-400 font-bold">{d?.label}</span>
    </div>
  );
}
