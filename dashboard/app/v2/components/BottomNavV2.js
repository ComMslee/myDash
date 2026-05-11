'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useScrollShrink } from '../../lib/useScrollShrink';

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
    label: '충전소',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
];

export default function BottomNavV2() {
  const pathname = usePathname();
  const shrunk = useScrollShrink();

  // dev 도구 페이지 + tg 어드민에서는 하단 탭 숨김 (탐색 가치 없음, 화면 절약)
  if (pathname?.startsWith('/dev') || pathname?.startsWith('/tg')) return null;

  return (
    <nav
      aria-label="V2 하단 탭 메뉴"
      className="fixed z-50 right-3 rounded-full bg-[#161618]/90 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] transition-[padding] duration-300"
      style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <div className={`flex items-center transition-all duration-300 ${shrunk ? 'gap-0.5 px-1.5 py-1' : 'gap-1.5 px-2.5 py-1.5'}`}>
        {tabs.map(({ href, label, icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          if (shrunk) {
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                className={`p-3 rounded-full transition-colors ${
                  isActive ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {icon}
              </Link>
            );
          }
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-3.5 py-1.5 rounded-2xl transition-colors min-w-[5rem] ${
                isActive ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {icon}
              <span className="text-[10px] font-semibold tracking-tight">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
