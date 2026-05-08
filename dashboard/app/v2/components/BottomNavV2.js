'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { usePeekSheet } from './PeekSheet';

// 3탭 — 홈 / 주행(이력 흡수) / 배터리(집충전소 흡수). 라벨 텍스트 제거: 이모지 + 메트릭만.
const tabs = [
  {
    href: '/home',
    id: 'home',
    icon: '🏠',
    // active 매칭 prefix
    matches: ['/home'],
  },
  {
    href: '/drives',
    id: 'drives',
    icon: '🚗',
    matches: ['/drives', '/history'],
  },
  {
    href: '/battery',
    id: 'battery',
    icon: '🔋',
    matches: ['/battery', '/chargers'],
  },
];

// quick-status 응답에서 탭별 메트릭 — 활성/비활성 모두 동일 라인.
// (라벨이 사라졌으니 메트릭이 곧 탭의 식별자 + 라이브 정보)
function tabMetric(tabId, data) {
  if (!data) return null;
  if (tabId === 'home') {
    const b = data.battery;
    if (!b) return null;
    if (b.charging) {
      return `${b.soc ?? '—'}% ⚡${b.charger_power_kw != null ? b.charger_power_kw.toFixed(1) : '—'}kW`;
    }
    return b.soc != null ? `${b.soc}%` : null;
  }
  if (tabId === 'drives') {
    const km = data.drives?.today_km;
    const lat = data.history?.latest;
    if (km == null && !lat) return null;
    if (km > 0) return `${km.toFixed(1)}km`;
    if (lat) return `최근 ${lat.distance.toFixed(0)}km`;
    return '쉬는 날';
  }
  if (tabId === 'battery') {
    const b = data.battery;
    const c = data.chargers;
    if (!b) return null;
    if (b.charging) {
      const kw = b.charger_power_kw;
      return kw != null ? `⚡${kw.toFixed(1)}kW` : '⚡ 충전';
    }
    if (c?.success_rate_today != null) {
      return `폴링 ${c.success_rate_today}%`;
    }
    return b.soc != null ? `${b.soc}%` : null;
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
        {tabs.map(({ href, id, icon, matches }) => {
          const isActive = matches.some(m => pathname === m || pathname.startsWith(m + '/'));
          const accent = peek?.tabMeta?.[id]?.accent || '#3b82f6';
          const metric = tabMetric(id, data);
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center py-1.5 gap-1 px-1 min-w-0 transition-colors"
              style={{ color: isActive ? accent : '#71717a' }}
            >
              <span
                className="text-xl leading-none"
                style={{ filter: isActive ? 'none' : 'grayscale(0.4) opacity(0.8)' }}
                aria-hidden
              >
                {icon}
              </span>
              <span
                key={metric || 'spacer'}
                className="text-[10px] tabular-nums leading-none truncate max-w-full font-semibold"
                style={{ opacity: metric ? (isActive ? 1 : 0.7) : 0 }}
                aria-hidden={!metric}
              >
                {metric || ' '}
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
