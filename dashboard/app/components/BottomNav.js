'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function BottomNav() {
  const pathname = usePathname();

  // V2 경로는 자체 네비를 사용
  if (pathname?.startsWith('/v2')) return null;

  const tabs = [
    {
      href: '/drives',
      label: '주행',
      // 통계/차트 아이콘
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 14l4-4 4 4 5-5" />
        </svg>
      ),
    },
    {
      href: '/battery',
      label: '배터리',
      // 배터리 + 번개
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="7" width="15" height="10" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 11v2" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 9l-2 4h3l-2 4" />
        </svg>
      ),
    },
    {
      href: '/roadtrips',
      label: '로드트립',
      // 지도 핀 아이콘
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0L6.343 16.657a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  return (
    <nav
      aria-label="하단 탭 메뉴"
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
      </div>
    </nav>
  );
}
