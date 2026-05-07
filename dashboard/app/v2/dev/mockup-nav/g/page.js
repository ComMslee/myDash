'use client';

// 목업 G — Nav Bar + Bottom Panel (Apple Music 미니플레이어 패턴)
// 하단 탭 + 그 위에 라이브 차량 상태 패널 (장식 아닌 정보).

import { useState } from 'react';
import Link from 'next/link';

const ICON = {
  drives: '🚗', history: '📜', battery: '🔋', chargers: '⚡', apps: '⊞',
};
const LABEL = {
  drives: '주행', history: '이력', battery: '배터리', chargers: '집충전소', apps: '앱',
};

const TABS = ['drives', 'history', 'battery', 'chargers', 'apps'];

// 차량 상태 시뮬 — 토글 버튼으로 순환
const CAR_STATES = [
  {
    key: 'driving',
    icon: '🚗',
    head: '주행 중',
    sub: '60 km/h · SOC 76% · 강남대로',
    tone: 'text-blue-400',
    target: 'drives',
  },
  {
    key: 'charging',
    icon: '⚡',
    head: '충전 중',
    sub: '76% (1시간 24분 남음) · 집',
    tone: 'text-emerald-400',
    target: 'battery',
  },
  {
    key: 'parked',
    icon: '🅿️',
    head: '정차',
    sub: '강남역 · 15분째 · SOC 76%',
    tone: 'text-amber-400',
    target: 'history',
  },
  {
    key: 'asleep',
    icon: '💤',
    head: '슬립 모드',
    sub: '24분 전 · SOC 76%',
    tone: 'text-zinc-400',
    target: 'battery',
  },
];

export default function MockG() {
  const [active, setActive] = useState('battery');
  const [stateIdx, setStateIdx] = useState(0);
  const car = CAR_STATES[stateIdx];

  const cycleState = () => setStateIdx(i => (i + 1) % CAR_STATES.length);

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 pt-5 pb-40 flex flex-col gap-4">
        <Link href="/v2/dev/mockup-nav" className="text-xs text-zinc-500 hover:text-zinc-300 -mb-1">
          ← 비교 인덱스로
        </Link>

        <FakeContent active={active} />

        <button
          onClick={cycleState}
          className="self-start text-xs text-zinc-500 underline-offset-4 hover:underline mt-2"
        >
          ↻ 차량 상태 토글 ({car.head})
        </button>
      </div>

      {/* 하단 — 패널 + 탭 한 묶음 */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 bg-[#0f0f0f] border-t border-white/[0.08]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="max-w-2xl mx-auto">
          {/* 라이브 패널 — 차량 상태 */}
          <button
            onClick={() => setActive(car.target)}
            className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06] hover:bg-white/[0.02] active:bg-white/[0.04] transition-colors text-left"
          >
            <span className="text-2xl leading-none flex-shrink-0">{car.icon}</span>
            <div className="flex-1 min-w-0">
              <div className={`text-[13px] font-bold ${car.tone}`}>{car.head}</div>
              <div className="text-[11px] text-zinc-500 truncate">{car.sub}</div>
            </div>
            <span className="text-zinc-600 text-base flex-shrink-0">›</span>
          </button>

          {/* 탭 */}
          <nav aria-label="하단 탭" className="flex">
            {TABS.map(k => {
              const isActive = active === k;
              return (
                <button
                  key={k}
                  onClick={() => setActive(k)}
                  className={`flex-1 flex flex-col items-center py-2.5 gap-1 transition-colors ${
                    isActive ? 'text-blue-400' : 'text-zinc-500'
                  }`}
                >
                  <span className="text-xl leading-none">{ICON[k]}</span>
                  <span className="text-[10px] font-semibold">{LABEL[k]}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <DebugChip active={active} />
    </main>
  );
}

function FakeContent({ active }) {
  return (
    <>
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-5">
        <div className="text-xs text-zinc-500 mb-2">현재 화면 — {LABEL[active] || active} (가상)</div>
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

function DebugChip({ active }) {
  return (
    <div className="fixed top-3 right-3 z-30 bg-black/70 backdrop-blur px-2.5 py-1 rounded-full text-[10px] text-zinc-400 border border-white/[0.06]">
      G. Nav + Panel · 활성: <span className="text-blue-400 font-bold">{LABEL[active] || active}</span>
    </div>
  );
}
