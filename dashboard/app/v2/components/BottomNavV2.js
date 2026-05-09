'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { usePeekSheet } from './PeekSheet';

// useLayoutEffect 는 SSR 시 경고 — 서버에선 useEffect 로 폴백.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// 3탭 — 홈 / 주행(이력 흡수) / 배터리(집충전소 흡수). SVG 아이콘 + (활성 탭만) 라벨 + 메트릭.
// 한국 지도 앱(네이버/카카오/T맵)은 항상 라벨 노출이 표준이지만, 우리는 절충 — 활성 탭만 라벨로 명시성 확보, 비활성은 컴팩트(아이콘+메트릭).
const tabs = [
  {
    href: '/home',
    id: 'home',
    label: '홈',
    matches: ['/home'],
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3v-7h6v7h3a1 1 0 001-1V10" />
      </svg>
    ),
  },
  {
    href: '/drives',
    id: 'drives',
    label: '주행',
    matches: ['/drives', '/history'],
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 14l4-4 4 4 5-5" />
      </svg>
    ),
  },
  {
    href: '/battery',
    id: 'battery',
    label: '배터리',
    matches: ['/battery', '/chargers'],
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="3" y="7" width="15" height="10" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 11v2" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 9l-2 4h3l-2 4" />
      </svg>
    ),
  },
];

// quick-status 응답 → 탭별 메트릭.
// 홈은 메트릭 없음 (페이지 자체가 요약). 주행=오늘 km, 배터리=SOC%.
function tabMetric(tabId, data) {
  if (!data) return null;
  if (tabId === 'home') return null; // 홈은 페이지가 요약, 탭 아래 정보 없음
  if (tabId === 'drives') {
    const km = data.drives?.today_km;
    if (km == null) return null;
    return km > 0 ? `${km.toFixed(1)}km` : '쉬는 날';
  }
  if (tabId === 'battery') {
    const b = data.battery;
    if (!b) return null;
    return b.soc != null ? `${b.soc}%` : null;
  }
  return null;
}

export default function BottomNavV2() {
  const pathname = usePathname();
  const peek = usePeekSheet();
  const data = peek?.data;
  const navRef = useRef(null);

  // PeekSheet 가 내비바 위에 정확히 안착하도록 실제 내비 높이를 CSS 변수로 publish.
  // useLayoutEffect 로 첫 페인트 전에 측정 — peek 와 nav 사이 초기 gap 방지.
  useIsoLayoutEffect(() => {
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
        {tabs.map(({ href, id, icon, label, matches }) => {
          const isActive = matches.some(m => pathname === m || pathname.startsWith(m + '/'));
          const accent = peek?.tabMeta?.[id]?.accent || '#3b82f6';
          const metric = tabMetric(id, data);
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center py-1.5 gap-0.5 px-1 min-w-0 transition-colors"
              style={{ color: isActive ? accent : '#71717a' }}
            >
              {icon}
              {/* 활성 탭만 라벨 노출 — 비활성은 컴팩트, 활성 탭은 위치 명시. */}
              {isActive && (
                <span className="text-[10px] font-bold leading-tight">{label}</span>
              )}
              {metric ? (
                <span
                  key={metric}
                  className="text-[10px] tabular-nums leading-none truncate max-w-full font-semibold"
                  style={{ opacity: isActive ? 1 : 0.7 }}
                >
                  {metric}
                </span>
              ) : (
                /* 홈처럼 메트릭 없는 탭도 다른 탭과 줄간격 맞추기 위해 빈 spacer */
                <span className="text-[10px] leading-none" aria-hidden>&nbsp;</span>
              )}
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
