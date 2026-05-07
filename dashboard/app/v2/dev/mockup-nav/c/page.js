'use client';

// 목업 C — Breadcrumb Top (상단 도메인 풀다운)
// 상단 한 줄에 현재 도메인, 탭 시 9 풀다운 (그룹 차량/앱/관리). 하단 영역 100% 콘텐츠.

import { useState } from 'react';
import Link from 'next/link';

const DOMAINS = [
  { key: 'drives', label: '주행', icon: '🚗', group: 'main' },
  { key: 'history', label: '이력', icon: '📜', group: 'main' },
  { key: 'battery', label: '배터리', icon: '🔋', group: 'main' },
  { key: 'chargers', label: '집충전소', icon: '⚡', group: 'main' },
  { key: 'spotify', label: '음악', icon: '🎵', group: 'apps' },
  { key: 'tg', label: '텔레그램', icon: '✈️', group: 'apps' },
  { key: 'api-status', label: 'API상태', icon: '🔧', group: 'admin' },
  { key: 'spotify-relogin', label: 'Spotify 재인증', icon: '🔄', group: 'admin' },
  { key: 'auth', label: '인증', icon: '🔐', group: 'admin' },
];

const GROUP_LABEL = { main: '차량', apps: '앱', admin: '관리' };

export default function MockC() {
  const [active, setActive] = useState('battery');
  const [open, setOpen] = useState(false);

  const current = DOMAINS.find(d => d.key === active);

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      {/* Breadcrumb top bar */}
      <header className="sticky top-0 z-40 bg-[#0f0f0f]/95 backdrop-blur border-b border-white/[0.06]">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            className="flex items-center gap-2 active:opacity-60 transition-opacity"
          >
            <span className="text-zinc-500 text-base leading-none">≡</span>
            <span className="text-2xl leading-none">{current?.icon}</span>
            <span className="text-base font-bold text-zinc-100">{current?.label}</span>
            <span className={`text-zinc-500 text-sm transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
          </button>
          <div className="text-[11px] text-zinc-500 font-semibold tabular-nums">국는 1.85⚡</div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-4 pb-12 flex flex-col gap-4">
        <Link href="/v2/dev/mockup-nav" className="text-xs text-zinc-500 hover:text-zinc-300 -mb-1">
          ← 비교 인덱스로
        </Link>
        <FakeContent active={active} />
      </div>

      {/* 풀다운 시트 */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-[fadeIn_120ms_ease-out]"
            onClick={() => setOpen(false)}
          />
          <div className="fixed top-0 left-0 right-0 z-50 bg-[#161618] border-b border-white/[0.08] rounded-b-3xl shadow-2xl pt-3 pb-5 max-h-[80vh] overflow-y-auto animate-[slideDown_200ms_ease-out]">
            <div className="max-w-2xl mx-auto px-4">
              <div className="flex justify-center pb-3">
                <span className="w-10 h-1 rounded-full bg-white/[0.18]" />
              </div>

              {['main', 'apps', 'admin'].map(group => (
                <div key={group} className="mb-5 last:mb-0">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2 px-1">
                    {GROUP_LABEL[group]}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {DOMAINS.filter(d => d.group === group).map(d => (
                      <button
                        key={d.key}
                        onClick={() => { setActive(d.key); setOpen(false); }}
                        className={`flex flex-col items-center gap-1 py-3 rounded-2xl border transition-colors ${
                          active === d.key
                            ? 'bg-blue-500/[0.12] border-blue-500/40'
                            : 'bg-[#0f0f0f] border-white/[0.06] hover:border-white/[0.12]'
                        }`}
                      >
                        <span className="text-2xl leading-none">{d.icon}</span>
                        <span className={`text-[11px] font-semibold ${active === d.key ? 'text-blue-400' : 'text-zinc-300'}`}>
                          {d.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <DebugChip label="C. Breadcrumb Top" active={active} />
      <style jsx global>{`
        @keyframes slideDown {
          from { transform: translateY(-100%); }
          to { transform: translateY(0); }
        }
      `}</style>
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
        상단 ≡ 도메인 ▾ 탭하면 9 풀다운
      </div>
    </>
  );
}

function DebugChip({ label, active }) {
  const d = DOMAINS.find(x => x.key === active);
  return (
    <div className="fixed bottom-3 right-3 z-30 bg-black/70 backdrop-blur px-2.5 py-1 rounded-full text-[10px] text-zinc-400 border border-white/[0.06]">
      {label} · 활성: <span className="text-blue-400 font-bold">{d?.label}</span>
    </div>
  );
}
