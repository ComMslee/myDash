'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { usePeekSheet } from './PeekSheet';

const tabs = [
  {
    href: '/drives',
    id: 'drives',
    label: '주행',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 14l4-4 4 4 5-5" />
      </svg>
    ),
  },
  {
    href: '/history',
    id: 'history',
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
    id: 'battery',
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
    id: 'chargers',
    label: '집 충전소',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
];

// quick-status 응답에서 탭별 짧은 라이브 메트릭 추출
function tabMetric(tabId, data) {
  if (!data) return null;
  if (tabId === 'drives') {
    const km = data.drives?.today_km;
    if (km == null) return null;
    return km > 0 ? `${km.toFixed(1)}km` : '쉬는 날';
  }
  if (tabId === 'history') {
    const n = data.history?.week_count;
    if (n == null) return null;
    return `이번 주 ${n}건`;
  }
  if (tabId === 'battery') {
    const b = data.battery;
    if (!b) return null;
    if (b.charging) {
      const kw = b.charger_power_kw;
      return kw != null ? `${b.soc}% · ⚡${kw.toFixed(1)}kW` : `${b.soc}% · ⚡`;
    }
    return b.soc != null ? `${b.soc}%` : null;
  }
  if (tabId === 'chargers') {
    const c = data.chargers;
    if (!c) return null;
    if (c.success_rate_today == null) return c.is_fresh ? '정상' : '대기';
    return `${c.success_rate_today}% ${c.is_fresh ? '정상' : '오래됨'}`;
  }
  return null;
}

export default function BottomNavV2() {
  const pathname = usePathname();
  const peek = usePeekSheet();
  const data = peek?.data;
  const navRef = useRef(null);

  // PeekSheet 가 내비바 위에 정확히 안착하도록 실제 내비 높이를 CSS 변수로 publish
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const update = () => {
      document.documentElement.style.setProperty('--peek-nav-h', `${el.offsetHeight}px`);
    };
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
      document.documentElement.style.removeProperty('--peek-nav-h');
    };
  }, []);

  // dev 도구 페이지 + tg 어드민에서는 하단 탭 숨김 (탐색 가치 없음, 화면 절약)
  const p = pathname || '';
  if (p.startsWith('/dev') || p.startsWith('/tg') || p.startsWith('/v2/dev') || p.startsWith('/v2/tg')) return null;

  return (
    <nav
      ref={navRef}
      aria-label="V2 하단 탭 메뉴"
      className="fixed bottom-0 left-0 right-0 z-50 bg-[#0f0f0f]/95 backdrop-blur border-t border-white/[0.06]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="max-w-2xl mx-auto flex">
        {tabs.map(({ href, id, label, icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          const accent = peek?.tabMeta?.[id]?.accent || '#3b82f6';
          const metric = tabMetric(id, data);
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center py-2 pb-2 gap-0.5 px-1 min-w-0 transition-colors"
              style={{ color: isActive ? accent : '#71717a' }}
            >
              {icon}
              <span className="text-[10px] font-semibold leading-tight">{label}</span>
              {/* 활성 탭은 peek 가 동일 정보를 더 크게 표시하므로 숨김(공간 유지). */}
              <span
                key={metric || 'spacer'}
                className="text-[9px] tabular-nums leading-none truncate max-w-full"
                style={{ opacity: isActive ? 0 : 0.7 }}
                aria-hidden={isActive || !metric}
              >
                {metric || ' '}
              </span>
              <span
                className="w-1 h-1 rounded-full"
                style={{ background: isActive ? accent : 'transparent' }}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
