'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const tabs = [
  {
    href: '/drives',
    label: '주행',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 14l4-4 4 4 5-5" />
      </svg>
    ),
  },
  {
    href: '/history',
    label: '이력',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0L6.343 16.657a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    href: '/battery',
    label: '배터리',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="3" y="7" width="15" height="10" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 11v2" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 9l-2 4h3l-2 4" />
      </svg>
    ),
  },
  {
    href: '/chargers',
    label: '집 충전소',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
];

// 마지막 '앱' 탭 — Link 가 아닌 버튼으로 동작, 누르면 런처 시트 토글.
// 새 보조 화면 추가 시 APPS 에 1줄.
const APPS = [
  {
    href: '/spotify',
    label: '음악',
    desc: 'Spotify 재생/곡 매시업',
    color: 'text-green-400',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19a3 3 0 11-6 0 3 3 0 016 0zm12-3a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    href: '/tg',
    label: '텔레그램',
    desc: '봇/구독자 관리',
    color: 'text-sky-400',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21.5 4.5L2.5 12.5l6 2 2 6 4-4 5 4z" />
      </svg>
    ),
  },
  {
    href: '/dev/api-status',
    label: 'API 상태',
    desc: '라우트 헬스 + 폴링 진단',
    color: 'text-amber-400',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.5 4h9a3 3 0 013 3v10a3 3 0 01-3 3h-9a3 3 0 01-3-3V7a3 3 0 013-3z" />
      </svg>
    ),
  },
  {
    href: '/dev/spotify-relogin',
    label: 'Spotify 재인증',
    desc: 'refresh_token revoke 시 1클릭',
    color: 'text-green-400',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-3-6.7M21 4v5h-5" />
      </svg>
    ),
  },
  {
    href: '/dev/auth',
    label: '인증 설정',
    desc: '로그인 비밀번호',
    color: 'text-violet-400',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0-1.657 1.343-3 3-3s3 1.343 3 3v3a3 3 0 11-6 0v-3zM5 11h2v3a2 2 0 002 2h2v2H9a4 4 0 01-4-4v-3z" />
      </svg>
    ),
  },
];

const APPS_ICON = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="3" y="3" width="7" height="7" rx="1.5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    <rect x="14" y="3" width="7" height="7" rx="1.5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    <rect x="3" y="14" width="7" height="7" rx="1.5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    <rect x="14" y="14" width="7" height="7" rx="1.5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
  </svg>
);

export default function BottomNavV2() {
  const pathname = usePathname();
  const [appsOpen, setAppsOpen] = useState(false);

  // 라우트 변경 시 시트 자동 닫기
  useEffect(() => { setAppsOpen(false); }, [pathname]);

  // ESC 로 닫기
  useEffect(() => {
    if (!appsOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setAppsOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [appsOpen]);

  // dev 도구 페이지 + tg 어드민에서는 하단 탭 숨김 (탐색 가치 없음, 화면 절약)
  if (pathname?.startsWith('/dev') || pathname?.startsWith('/tg') || pathname?.startsWith('/spotify')) return null;

  return (
    <>
      {/* 앱 런처 시트 — 윈도우키 누르면 뜨는 런처처럼 화면 하단에서 슬라이드. */}
      {appsOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm animate-[fadeIn_120ms_ease-out]"
          onClick={() => setAppsOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="앱 런처"
        >
          <div
            className="absolute left-0 right-0 bg-[#0f0f0f] border-t border-white/[0.08] rounded-t-2xl pt-2 pb-4 shadow-2xl animate-[slideUp_180ms_ease-out]"
            style={{ bottom: 'calc(57px + env(safe-area-inset-bottom, 0px))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="max-w-2xl mx-auto px-4">
              <div className="flex items-center justify-center pb-2">
                <span className="w-10 h-1 rounded-full bg-white/[0.12]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {APPS.map(({ href, label, desc, color, icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setAppsOpen(false)}
                    className="flex flex-col gap-2 bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-4 hover:bg-white/[0.03] active:bg-white/[0.06] transition-colors"
                  >
                    <span className={color}>{icon}</span>
                    <div>
                      <p className="text-sm font-bold text-zinc-200">{label}</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">{desc}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <nav
        aria-label="V2 하단 탭 메뉴"
        className="fixed bottom-0 left-0 right-0 z-50 bg-[#0f0f0f]/95 backdrop-blur border-t border-white/[0.06]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-2xl mx-auto flex">
          {tabs.map(({ href, label, icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={`flex-1 flex flex-col items-center py-2.5 pb-2 gap-1 transition-colors ${
                  isActive ? 'text-blue-400' : 'text-zinc-600'
                }`}
              >
                {icon}
                <span className="text-[10px] font-semibold">{label}</span>
                <span
                  className="w-1 h-1 rounded-full"
                  style={{ background: isActive ? '#3b82f6' : 'transparent' }}
                />
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setAppsOpen(o => !o)}
            aria-expanded={appsOpen}
            aria-haspopup="dialog"
            className={`flex-1 flex flex-col items-center py-2.5 pb-2 gap-1 transition-colors ${
              appsOpen ? 'text-blue-400' : 'text-zinc-600'
            }`}
          >
            {APPS_ICON}
            <span className="text-[10px] font-semibold">앱</span>
            <span
              className="w-1 h-1 rounded-full"
              style={{ background: appsOpen ? '#3b82f6' : 'transparent' }}
            />
          </button>
        </div>
      </nav>
    </>
  );
}
