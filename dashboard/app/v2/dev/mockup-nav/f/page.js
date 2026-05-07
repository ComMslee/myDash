'use client';

// 목업 F — Top Pills (지도앱 카테고리 스타일)
// Naver/Kakao 지도 상단 "음식점·카페·편의점..." 칩과 동일 패턴.
// floating 0, 하단 탭 0, 화면 하단 100% 콘텐츠.

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

const DOMAINS = [
  { key: 'drives', label: '주행', icon: '🚗' },
  { key: 'history', label: '이력', icon: '📜' },
  { key: 'battery', label: '배터리', icon: '🔋' },
  { key: 'chargers', label: '집충전소', icon: '⚡' },
  { key: 'spotify', label: '음악', icon: '🎵' },
  { key: 'tg', label: '텔레그램', icon: '✈️' },
  { key: 'api-status', label: 'API상태', icon: '🔧' },
  { key: 'spotify-relogin', label: 'Spotify 재인증', icon: '🔄' },
  { key: 'auth', label: '인증', icon: '🔐' },
];

export default function MockF() {
  const [active, setActive] = useState('battery');
  const railRef = useRef(null);

  // 활성 pill 자동 중앙 정렬
  useEffect(() => {
    const el = railRef.current?.querySelector(`[data-key="${active}"]`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [active]);

  const current = DOMAINS.find(d => d.key === active);

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      {/* 상단 sticky pill bar — 지도앱 카테고리 스타일 */}
      <header className="sticky top-0 z-40 bg-[#0f0f0f] border-b border-white/[0.06]">
        <div className="max-w-2xl mx-auto">
          <div
            ref={railRef}
            className="flex gap-1.5 px-3 py-2.5 overflow-x-auto scrollbar-hide"
          >
            {DOMAINS.map(d => {
              const isActive = active === d.key;
              return (
                <button
                  key={d.key}
                  data-key={d.key}
                  onClick={() => setActive(d.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors flex-shrink-0 ${
                    isActive
                      ? 'bg-blue-500 text-white font-semibold'
                      : 'bg-zinc-900 text-zinc-400 border border-white/[0.06] hover:text-zinc-200'
                  }`}
                >
                  <span className="text-base leading-none">{d.icon}</span>
                  <span>{d.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* 페이지 콘텐츠 — 하단 탭 없으니 100% 활용 */}
      <div className="max-w-2xl mx-auto px-4 pt-5 pb-12 flex flex-col gap-4">
        <Link href="/v2/dev/mockup-nav" className="text-xs text-zinc-500 hover:text-zinc-300 -mb-1">
          ← 비교 인덱스로
        </Link>
        <FakeContent current={current} />
      </div>

      <DebugChip current={current} />

      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { scrollbar-width: none; }
      `}</style>
    </main>
  );
}

function FakeContent({ current }) {
  return (
    <>
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-5">
        <div className="text-xs text-zinc-500 mb-2">현재 화면 — {current.label} (가상)</div>
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
        상단 칩을 좌우로 스와이프해서 다른 도메인으로 이동 (지도앱 카테고리)
      </div>
    </>
  );
}

function DebugChip({ current }) {
  return (
    <div className="fixed bottom-3 right-3 z-30 bg-black/70 backdrop-blur px-2.5 py-1 rounded-full text-[10px] text-zinc-400 border border-white/[0.06]">
      F. Top Pills · 활성: <span className="text-blue-400 font-bold">{current.label}</span>
    </div>
  );
}
