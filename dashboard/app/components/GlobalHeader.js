'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMock, MOCK_DATA } from '../context/mock';
import { formatDuration } from '../../lib/format';

// GlobalHeader를 숨길 경로 (서브/상세 페이지 + dev 도구 + 로그인/등록)
const HIDDEN_ROUTES = ['/rankings', '/v1/rankings', '/dev', '/tg', '/login', '/setup'];

// 우측 상단 ⚙️ 시트 메뉴 — 자주 안 쓰는 부속 화면 모음.
const SETTINGS = [
  {
    href: '/tg',
    label: '텔레그램',
    desc: '봇 / 구독자 관리',
    color: 'text-sky-400',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.5 4h9a3 3 0 013 3v10a3 3 0 01-3 3h-9a3 3 0 01-3-3V7a3 3 0 013-3z" />
      </svg>
    ),
  },
  {
    href: '/dev/auth',
    label: '인증 설정',
    desc: '로그인 비밀번호',
    color: 'text-violet-400',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0-1.657 1.343-3 3-3s3 1.343 3 3v3a3 3 0 11-6 0v-3zM5 11h2v3a2 2 0 002 2h2v2H9a4 4 0 01-4-4v-3z" />
      </svg>
    ),
  },
];

const GEAR_ICON = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

export default function GlobalHeader() {
  const pathname = usePathname();
  const { isMock, toggleMock, isMockCharging, toggleMockCharging, lastRefresh, mockData } = useMock();
  const [car, setCar] = useState(null);
  const [charging, setCharging] = useState(null);
  const [carFetchedAt, setCarFetchedAt] = useState(null);
  const [, setTick] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // 라우트 변경 시 시트 자동 닫기
  useEffect(() => { setSettingsOpen(false); }, [pathname]);

  // ESC 로 닫기
  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setSettingsOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen]);

  const activeMockData = mockData || MOCK_DATA;
  const hidden = HIDDEN_ROUTES.some(p => pathname === p || pathname.startsWith(p + '/'));

  useEffect(() => {
    if (hidden) return;
    if (isMock) {
      setCar(activeMockData.car);
      setCharging(isMockCharging ? activeMockData.chargingStatus : null);
      setCarFetchedAt(new Date());
      return;
    }
    const fetchData = () =>
      Promise.all([
        fetch('/api/car').then(r => r.json()).catch(() => null),
        fetch('/api/charging-status').then(r => r.json()).catch(() => null),
      ]).then(([carData, chargingData]) => {
        if (carData) setCar(carData);
        setCharging(chargingData?.charging ? chargingData : null);
        setCarFetchedAt(new Date());
      });
    fetchData();
    const id = setInterval(fetchData, 30000);
    return () => clearInterval(id);
  }, [hidden, isMock, isMockCharging, activeMockData]);

  if (hidden) return null;

  const isCharging = !!charging || car?.state === 'charging';
  const effectiveState = (isMock && isMockCharging) ? 'charging' : car?.state;
  const lvl = isCharging ? (charging?.battery_level ?? car?.battery_level ?? 0) : (car?.battery_level ?? 0);
  const limitLvl = charging?.charge_limit_soc ?? null;
  const estRange = car?.est_battery_range ?? null;
  // SOC 체류 분포와 토큰 통일: ideal/good=emerald, caution=amber, stress=red
  const color = lvl > 50 ? '#10b981' : lvl > 20 ? '#f59e0b' : '#ef4444';

  const timeLabel = lastRefresh
    ? lastRefresh.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
    : carFetchedAt
      ? carFetchedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
      : null;

  const lastSeenLabel = car?.last_seen
    ? new Date(car.last_seen).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
    : null;

  // 확정 상태(주차/주행/충전)별 경과 시간 계산
  // states 테이블이 아직 driving으로 전환 전이어도 진행중 drive(current_drive_start)가 있으면 주행
  const isDriving = effectiveState === 'driving' || !!car?.current_drive_start;
  const displayState = isCharging ? 'charging' : isDriving ? 'driving' : 'parked';

  let elapsedSince = null;
  if (displayState === 'charging') elapsedSince = charging?.start_date ?? null;
  else if (displayState === 'driving') elapsedSince = car?.current_drive_start ?? null;
  else if (displayState === 'parked') elapsedSince = car?.last_drive_end ?? null;

  const elapsedMin = elapsedSince
    ? Math.max(0, Math.floor((Date.now() - new Date(elapsedSince).getTime()) / 60000))
    : null;

  // 충전 진행률 (현재% → 목표%)
  const startLvl = charging?.start_battery_level ?? (lvl > 10 ? lvl - 10 : 0);
  const chargePctDenom = limitLvl - startLvl;
  const chargePct = limitLvl && limitLvl > lvl && chargePctDenom > 0
    ? Math.max(0, Math.min(100, Math.round(((lvl - startLvl) / chargePctDenom) * 100)))
    : null;

  return (
    <>
    {/* ⚙️ 설정 시트 — 우측 상단 드롭다운, 텔레그램/API 상태/인증 모음 */}
    {settingsOpen && (
      <div
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm animate-[fadeIn_120ms_ease-out]"
        onClick={() => setSettingsOpen(false)}
        role="dialog"
        aria-modal="true"
        aria-label="설정"
      >
        <div
          className="absolute right-3 top-12 w-64 bg-[#0f0f0f] border border-white/[0.08] rounded-2xl py-1.5 shadow-2xl animate-[slideDown_160ms_ease-out]"
          onClick={(e) => e.stopPropagation()}
          style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}
        >
          {SETTINGS.map(({ href, label, desc, color, icon }, i) => (
            <Link
              key={href}
              href={href}
              onClick={() => setSettingsOpen(false)}
              className={`flex items-center gap-3 px-3.5 py-2.5 hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors ${
                i > 0 ? 'border-t border-white/[0.04]' : ''
              }`}
            >
              <span className={`flex-shrink-0 ${color}`}>{icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-zinc-200">{label}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    )}
    <header
      className="sticky top-0 z-50 bg-[#0f0f0f]/90 backdrop-blur border-b border-white/[0.06] relative overflow-hidden"
    >
      {/* 배터리 게이지 — 헤더 배경 */}
      <div
        className="absolute inset-y-0 left-0 transition-all duration-700 pointer-events-none"
        style={{
          width: `${lvl}%`,
          background: `linear-gradient(90deg, ${color}3d 0%, ${color}22 70%, ${color}0a 100%)`,
        }}
        aria-hidden="true"
      />
      {/* 투톤 게이지 — 시작 SOC → 현재 SOC 구간을 밝은 emerald 로 덧칠 (delta 가시화) */}
      {isCharging && charging?.start_battery_level != null && charging.start_battery_level < lvl && (
        <div
          className="absolute inset-y-0 transition-all duration-700 pointer-events-none"
          style={{
            left: `${charging.start_battery_level}%`,
            width: `${lvl - charging.start_battery_level}%`,
            background: 'linear-gradient(90deg, rgba(110,231,183,0.30) 0%, rgba(110,231,183,0.55) 100%)',
          }}
          aria-hidden="true"
        />
      )}
      {/* 충전 목표 지점 세로선 */}
      {isCharging && limitLvl && limitLvl > lvl && (
        <div
          className="absolute inset-y-0 w-px bg-white/30 pointer-events-none"
          style={{ left: `${limitLvl}%` }}
          aria-hidden="true"
        />
      )}
      <div className="relative max-w-2xl mx-auto px-4 py-1.5 flex items-center gap-2">

        {/* 좌측: 상태 아이콘 + 온라인 + 경과시간 */}
        <div className="flex items-center gap-1.5 min-w-0">
          {(() => {
            if (!displayState) return null;
            const MAP = {
              charging: {
                label: '충전 중',
                cls: 'from-green-500/25 to-green-600/10 border-green-500/40 charge-pulse',
                txt: 'text-green-400',
                icon: <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />,
              },
              driving: {
                label: '주행 중',
                cls: 'from-blue-500/25 to-blue-600/10 border-blue-500/40',
                txt: 'text-blue-400',
                icon: <path d="M5 13h11.17l-4.88 4.88a.996.996 0 1 0 1.41 1.41l6.59-6.59a.996.996 0 0 0 0-1.41l-6.58-6.6a.996.996 0 1 0-1.41 1.41L16.17 11H5c-.55 0-1 .45-1 1s.45 1 1 1z" />,
              },
              parked: {
                label: '주차 중',
                cls: 'from-zinc-500/20 to-zinc-600/10 border-zinc-500/30',
                txt: 'text-zinc-300',
                icon: <path d="M13 3H6v18h4v-6h3a6 6 0 0 0 0-12zm.2 8H10V7h3.2a2 2 0 1 1 0 4z" />,
              },
            };
            const conf = MAP[displayState];
            return (
              <div
                className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 border transition-colors bg-gradient-to-br ${conf.cls}`}
                title={conf.label}
              >
                <svg className={`w-3.5 h-3.5 ${conf.txt}`} fill="currentColor" viewBox="0 0 24 24">
                  {conf.icon}
                </svg>
                <span className="sr-only">{conf.label}</span>
              </div>
            );
          })()}
          {(() => {
            // 온라인으로 간주: driving/charging/online, 그리고 position이 최근(≤5분)일 때만
            const STALE_MS = 5 * 60_000;
            const lastSeenMs = car?.last_seen ? new Date(car.last_seen).getTime() : null;
            const stale = !lastSeenMs || (Date.now() - lastSeenMs) > STALE_MS;
            const liveStates = new Set(['driving', 'charging', 'online']);
            const isOnline = liveStates.has(effectiveState) && !stale;
            const isOffline = !isOnline;
            const dotColor = isOffline ? 'bg-zinc-500' : 'bg-emerald-400';
            const label = isOffline ? (lastSeenLabel ?? timeLabel ?? '오프라인') : '온라인';
            if (!label) return null;
            return (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800/80 border border-white/5 text-zinc-500 flex-shrink-0">
                <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${isOffline ? '' : 'animate-pulse'}`} aria-hidden="true" />
                <span className="text-[11px] tabular-nums">{label}</span>
              </span>
            );
          })()}
          {elapsedMin != null && (
            <span className="text-[11px] tabular-nums text-zinc-500 flex-shrink-0">{formatDuration(elapsedMin)}</span>
          )}
        </div>

        <div className="flex-1" />

        {/* 우측: SOC%/kW/range 모두 BottomNav 의 탭 메트릭으로 흡수. 배경 게이지로
            시각적 SOC 컨텍스트만 유지. 충전 중에는 charge-pulse 가 좌측 아이콘에서
            상태를 표시. 예측 거리는 비충전 시에만 짧게. */}
        {!isCharging && estRange && (
          <span className="text-zinc-500 text-[11px] tabular-nums">{estRange}<span className="text-zinc-600 text-[10px] ml-0.5">km</span></span>
        )}

        {process.env.NODE_ENV !== 'production' && (
          <>
            {isMock && (
              <button
                onClick={toggleMockCharging}
                className={`text-xs px-2 py-1 rounded-full border font-medium transition-colors flex-shrink-0 ${
                  isMockCharging
                    ? 'bg-green-500/20 text-green-400 border-green-500/30'
                    : 'bg-zinc-800/80 text-zinc-600 border-white/5 hover:text-zinc-400'
                }`}
                title="충전 중 토글"
              >
                <span aria-hidden="true">⚡</span>
              </button>
            )}
            <button
              onClick={toggleMock}
              className={`text-xs px-2 py-1 rounded-full border font-medium transition-colors flex-shrink-0 ${
                isMock
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  : 'bg-zinc-800/80 text-zinc-600 border-white/5 hover:text-zinc-400'
              }`}
            >
              가상
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => setSettingsOpen(o => !o)}
          aria-expanded={settingsOpen}
          aria-haspopup="dialog"
          className={`p-1.5 rounded-full transition-colors flex-shrink-0 ${
            settingsOpen ? 'text-blue-400 bg-white/[0.06]' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
          }`}
          title="설정"
        >
          {GEAR_ICON}
          <span className="sr-only">설정</span>
        </button>
      </div>

      {/* 충전 진행 바 */}
      {isCharging && (
        <div className="h-0.5 bg-zinc-800/80">
          <div
            className="h-full bg-green-500/70 transition-all duration-700"
            style={{ width: `${chargePct != null ? chargePct : lvl}%` }}
          />
        </div>
      )}

    </header>
    </>
  );
}
