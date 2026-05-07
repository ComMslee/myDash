'use client';

// 목업 D — Grounded (무화려 보수안)
// floating 0, 시트 0, 데코 0. 메인 4탭(주행/이력/배터리/앱), 앱은 풀페이지 그리드.

import { useState } from 'react';
import Link from 'next/link';

const ICON = {
  drives: '🚗', history: '📜', battery: '🔋', apps: '⊞',
  chargers: '⚡', spotify: '🎵', tg: '✈️',
  'api-status': '🔧', 'spotify-relogin': '🔄', auth: '🔐',
};
const LABEL = {
  drives: '주행', history: '이력', battery: '배터리', apps: '앱',
  chargers: '집 충전소', spotify: '음악', tg: '텔레그램',
  'api-status': 'API 상태', 'spotify-relogin': 'Spotify 재인증', auth: '인증 설정',
};

const MAIN_TABS = ['drives', 'history', 'battery', 'apps'];
const APPS_USER = ['chargers', 'spotify', 'tg'];
const APPS_ADMIN = ['api-status', 'spotify-relogin', 'auth'];

export default function MockD() {
  const [active, setActive] = useState('battery'); // 메인 탭 활성
  const [appsView, setAppsView] = useState('user'); // 'user' | 'admin' — 앱 페이지 안 sub
  const isAppsTab = active === 'apps';

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 pt-5 pb-24 flex flex-col gap-4">
        <Link href="/v2/dev/mockup-nav" className="text-xs text-zinc-500 hover:text-zinc-300 -mb-1">
          ← 비교 인덱스로
        </Link>

        {/* 콘텐츠 — 활성 탭에 따라 분기 */}
        {!isAppsTab ? (
          <FakeDomainContent active={active} />
        ) : (
          <AppsPage view={appsView} setView={setAppsView} setActive={setActive} />
        )}
      </div>

      {/* 평범한 하단 탭 — floating 아님, 일반 sticky */}
      <nav
        aria-label="하단 탭"
        className="fixed bottom-0 left-0 right-0 z-40 bg-[#0f0f0f] border-t border-white/[0.08]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="max-w-2xl mx-auto flex">
          {MAIN_TABS.map(k => {
            const isActive = active === k;
            return (
              <button
                key={k}
                onClick={() => { setActive(k); setAppsView('user'); }}
                className={`flex-1 flex flex-col items-center py-2.5 gap-1 transition-colors ${
                  isActive ? 'text-blue-400' : 'text-zinc-500'
                }`}
              >
                <span className="text-xl leading-none">{ICON[k]}</span>
                <span className="text-[10px] font-semibold">{LABEL[k]}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <DebugChip active={active} />
    </main>
  );
}

function FakeDomainContent({ active }) {
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

function AppsPage({ view, setView, setActive }) {
  const isAdmin = view === 'admin';
  const list = isAdmin ? APPS_ADMIN : APPS_USER;

  return (
    <>
      <div className="flex items-center justify-between mt-2">
        <h1 className="text-xl font-bold">{isAdmin ? '관리' : '앱'}</h1>
        {isAdmin && (
          <button onClick={() => setView('user')} className="text-xs text-zinc-500 hover:text-zinc-300">
            ← 앱
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mt-2">
        {list.map(k => (
          <button
            key={k}
            onClick={() => { /* 실제로는 라우팅, 목업이라 활성 도메인만 표기 */ setActive(k); }}
            className="flex items-start gap-3 bg-[#161618] border border-white/[0.06] rounded-2xl p-4 hover:border-white/[0.12] active:bg-white/[0.03] transition-colors text-left"
          >
            <span className="text-3xl leading-none">{ICON[k]}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-zinc-200">{LABEL[k]}</div>
              <div className="text-[11px] text-zinc-500 mt-0.5 truncate">
                {APPS_DESC[k]}
              </div>
            </div>
          </button>
        ))}
      </div>

      {!isAdmin && (
        <button
          onClick={() => setView('admin')}
          className="self-start text-xs text-zinc-500 hover:text-zinc-300 mt-6 underline-offset-4 hover:underline"
        >
          관리 도구 →
        </button>
      )}
    </>
  );
}

const APPS_DESC = {
  chargers: '집 충전기 사용 통계',
  spotify: 'Spotify 재생/매시업',
  tg: '텔레그램 봇·구독자',
  'api-status': '라우트 헬스 진단',
  'spotify-relogin': 'refresh_token 재발급',
  auth: '로그인 비밀번호',
};

function DebugChip({ active }) {
  return (
    <div className="fixed top-3 right-3 z-30 bg-black/70 backdrop-blur px-2.5 py-1 rounded-full text-[10px] text-zinc-400 border border-white/[0.06]">
      D. Grounded · 활성: <span className="text-blue-400 font-bold">{LABEL[active]}</span>
    </div>
  );
}
