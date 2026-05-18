'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMock, MOCK_DATA } from '../../context/mock';
import { formatDuration } from '../../../lib/format';
import { useScrollShrink } from '../../lib/useScrollShrink';
import { Icon } from '../../lib/Icons';

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

// ⚙️ 설정 시트 — 자동화/텔레그램/API상태/인증 어드민 진입점
const SETTINGS = [
  {
    href: '/schedule',
    label: '자동화',
    desc: '센트리 · 공조 스케줄 / 사용량',
    color: 'text-emerald-400',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
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
    label: '서버 상태',
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
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

// 상태 아이콘 chip — P/D/⚡ + 그라데이션 배경
//   parked: zinc, driving: blue, charging: green (charge-pulse 애니메이션)
//   이모지(🅿️/🚗/⚡) 는 OS 마다 색이 달라 (특히 🅿️ 파랑 배경) 디자인 일관성 깨짐 → SVG 로 통일.
const STATE_CHIP = {
  parked: {
    cls: 'from-zinc-500/20 to-zinc-600/10 border-zinc-500/30',
    txt: 'text-zinc-300',
    label: '주차 중',
    icon: <path d="M13 3H6v18h4v-6h3a6 6 0 0 0 0-12zm.2 8H10V7h3.2a2 2 0 1 1 0 4z" />,
  },
  driving: {
    cls: 'from-blue-500/25 to-blue-600/10 border-blue-500/40',
    txt: 'text-blue-400',
    label: '주행 중',
    icon: <path d="M6 3v18h6a9 9 0 0 0 0-18H6zm4 4h2a5 5 0 0 1 0 10h-2V7z" />,
  },
  charging: {
    cls: 'from-green-500/25 to-green-600/10 border-green-500/40 charge-pulse',
    txt: 'text-green-400',
    label: '충전 중',
    icon: <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />,
  },
};

function StateChip({ state }) {
  const conf = STATE_CHIP[state] || STATE_CHIP.parked;
  return (
    <div
      className={`w-[28px] h-[28px] rounded-lg flex items-center justify-center flex-shrink-0 border bg-gradient-to-br ${conf.cls}`}
      title={conf.label}
    >
      <svg className={`w-[18px] h-[18px] ${conf.txt}`} fill="currentColor" viewBox="0 0 24 24">
        {conf.icon}
      </svg>
      <span className="sr-only">{conf.label}</span>
    </div>
  );
}

export default function BottomNavV2() {
  const pathname = usePathname();
  const shrunk = useScrollShrink();
  const { isMock, toggleMock, isMockCharging, toggleMockCharging, mockData } = useMock();
  const [car, setCar] = useState(null);
  const [charging, setCharging] = useState(null);
  const [, setTick] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 1분 tick — 경과/시각 라벨 자동 갱신
  useEffect(() => {
    let id = null;
    const start = () => {
      if (id != null) return;
      id = setInterval(() => setTick(t => t + 1), 60_000);
    };
    const stop = () => { if (id != null) { clearInterval(id); id = null; } };
    const onVis = () => { if (document.hidden) stop(); else { setTick(t => t + 1); start(); } };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  // 라우트 변경 시 시트 자동 닫기
  useEffect(() => { setSettingsOpen(false); }, [pathname]);

  // ESC 로 시트 닫기
  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setSettingsOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen]);

  // 차량/충전 데이터 30초 폴링 — mock 모드에선 MOCK_DATA 사용.
  // 탭 숨김 시 폴링 정지, 복귀 시 즉시 1회 fetch + 인터벌 재개 (불필요한 백그라운드 요청 차단).
  const activeMockData = mockData || MOCK_DATA;
  useEffect(() => {
    if (isMock) {
      setCar(activeMockData.car);
      setCharging(isMockCharging ? activeMockData.chargingStatus : null);
      return;
    }
    let id = null;
    const fetchData = () =>
      Promise.all([
        fetch('/api/car').then(r => r.json()).catch(() => null),
        fetch('/api/charging-status').then(r => r.json()).catch(() => null),
      ]).then(([carData, chargingData]) => {
        if (carData) setCar(carData);
        setCharging(chargingData?.charging ? chargingData : null);
      });
    const start = () => {
      if (id != null) return;
      fetchData();
      id = setInterval(fetchData, 30_000);
    };
    const stop = () => { if (id != null) { clearInterval(id); id = null; } };
    const onVis = () => { if (document.hidden) stop(); else start(); };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [isMock, isMockCharging, activeMockData]);

  // 상태 계산 — 헤더 로직 그대로 (확정 상태별 경과 시간/충전 진행/SOC fill)
  const isCharging = !!charging || car?.state === 'charging';
  const effectiveState = (isMock && isMockCharging) ? 'charging' : car?.state;
  const lvl = isCharging ? (charging?.battery_level ?? car?.battery_level ?? 0) : (car?.battery_level ?? 0);
  const limitLvl = charging?.charge_limit_soc ?? null;
  const estRange = car?.est_battery_range ?? null;

  const isDriving = effectiveState === 'driving' || !!car?.current_drive_start;
  const displayState = isCharging ? 'charging' : isDriving ? 'driving' : 'parked';

  const STALE_MS = 5 * 60_000;
  const lastSeenMs = car?.last_seen ? new Date(car.last_seen).getTime() : null;
  const stale = !lastSeenMs || (Date.now() - lastSeenMs) > STALE_MS;
  const liveStates = new Set(['driving', 'charging', 'online']);
  const isOnline = liveStates.has(effectiveState) && !stale;

  let elapsedSince = null;
  if (displayState === 'charging') elapsedSince = charging?.start_date ?? null;
  else if (displayState === 'driving') elapsedSince = car?.current_drive_start ?? null;
  else if (displayState === 'parked') elapsedSince = car?.last_drive_end ?? null;

  const elapsedMin = elapsedSince
    ? Math.max(0, Math.floor((Date.now() - new Date(elapsedSince).getTime()) / 60000))
    : null;

  const remainMin = charging?.time_to_full_charge ? Math.round(charging.time_to_full_charge * 60) : null;
  const lastSeenLabel = car?.last_seen
    ? new Date(car.last_seen).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
    : null;

  // SOC fill 색: 충전 yellow(노랑) / 그 외 green(초록).
  //   isOnline 분기 제거 — 슬립/스테일 차량도 마지막 본 SOC 자체는 유효 데이터,
  //   회색으로 가리면 "데이터 없음"으로 오해. 오프라인은 정보 행 dot 으로만 표시.
  const fillRgb = isCharging ? '234,179,8' : '34,197,94';
  const startLvl = charging?.start_battery_level ?? null;
  const showInfoRow = !shrunk && car;
  const showMockToggles = process.env.NODE_ENV !== 'production';

  return (
    <>
      {/* ⚙️ 설정 시트 — 알약 위로 펼침 */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm animate-[fadeIn_120ms_ease-out]"
          onClick={() => setSettingsOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="설정"
        >
          <div
            className="absolute right-3 w-64 bg-[#0f0f0f] border border-white/[0.08] rounded-2xl py-1.5 shadow-2xl animate-[slideUp_160ms_ease-out]"
            onClick={(e) => e.stopPropagation()}
            style={{ bottom: `calc(0.75rem + env(safe-area-inset-bottom) + ${shrunk ? '3.25rem' : '6rem'})` }}
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
            {showMockToggles && (
              <div className="px-3.5 py-2 border-t border-white/[0.04] flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-500 mr-1">DEV</span>
                <button
                  onClick={toggleMock}
                  className={`text-xs px-2 py-1 rounded-full border font-medium transition-colors ${
                    isMock
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      : 'bg-zinc-800/80 text-zinc-500 border-white/5'
                  }`}
                >
                  가상 {isMock ? 'ON' : 'OFF'}
                </button>
                {isMock && (
                  <button
                    onClick={toggleMockCharging}
                    className={`text-xs px-2 py-1 rounded-full border font-medium transition-colors inline-flex items-center justify-center ${
                      isMockCharging
                        ? 'bg-green-500/20 text-green-400 border-green-500/30'
                        : 'bg-zinc-800/80 text-zinc-500 border-white/5'
                    }`}
                    title="가상 충전 토글"
                  >
                    <Icon name="bolt" className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <nav
        aria-label="V2 하단 탭 메뉴"
        className="fixed z-50 right-3 rounded-3xl bg-[#161618]/90 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden transition-[padding] duration-300"
        style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        {/* SOC fill 배경 — 알약 전체 좌→우 fill, 우측 끝 짙음 + 1.5px 경계선 (현재 SOC 명확화) */}
        <div
          className="absolute inset-y-0 left-0 transition-all duration-700 pointer-events-none"
          style={{
            width: `${lvl}%`,
            background: `linear-gradient(90deg, rgba(${fillRgb},0.20) 0%, rgba(${fillRgb},0.18) 90%, rgba(${fillRgb},0.40) 100%)`,
            borderRight: lvl > 0 ? `1.5px solid rgba(${fillRgb},0.7)` : undefined,
          }}
          aria-hidden="true"
        />
        {/* 충전 투톤 — start→cur 구간 강조 */}
        {isCharging && startLvl != null && startLvl < lvl && (
          <div
            className="absolute inset-y-0 transition-all duration-700 pointer-events-none"
            style={{
              left: `${startLvl}%`,
              width: `${lvl - startLvl}%`,
              background: 'linear-gradient(90deg, rgba(253,224,71,0.30) 0%, rgba(253,224,71,0.45) 100%)',
            }}
            aria-hidden="true"
          />
        )}
        {/* 충전 목표선 */}
        {isCharging && limitLvl && limitLvl > lvl && (
          <div
            className="absolute inset-y-0 w-[3px] bg-white/50 pointer-events-none shadow-[0_0_4px_rgba(255,255,255,0.4)]"
            style={{ left: `calc(${limitLvl}% - 1.5px)` }}
            aria-hidden="true"
          />
        )}

        {/* 정보 행 — full 모드 전용 */}
        {showInfoRow && (
          <div className="relative px-3 py-1.5 border-b border-white/[0.06] flex items-center gap-2 text-[12px] tabular-nums whitespace-nowrap overflow-hidden">
            <StateChip state={displayState} />
            <span
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isOnline ? 'bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-zinc-500'}`}
              aria-hidden="true"
            />
            {isCharging ? (
              <>
                <span className="text-yellow-200 font-semibold">{lvl}%</span>
                {limitLvl != null && <span className="text-zinc-300">→{limitLvl}%</span>}
                {remainMin != null && (
                  <>
                    <span className="text-zinc-500">·</span>
                    <span className="text-zinc-100">{formatDuration(remainMin)}</span>
                  </>
                )}
                {charging?.charger_power != null && (
                  <>
                    <span className="text-zinc-500">·</span>
                    <span className="text-zinc-100">{charging.charger_power}kW</span>
                  </>
                )}
              </>
            ) : (
              <>
                {!isOnline && lastSeenLabel ? (
                  <span className="text-zinc-300">{lastSeenLabel}</span>
                ) : elapsedMin != null ? (
                  <span className="text-zinc-100">{formatDuration(elapsedMin)}</span>
                ) : null}
                {/* 예측 km · % — 우측 정렬 */}
                <span className="ml-auto flex items-center gap-2">
                  {estRange != null && (
                    <span className="text-zinc-200">{estRange}<span className="text-zinc-400 text-[10px] ml-0.5">km</span></span>
                  )}
                  {estRange != null && <span className="text-zinc-500">·</span>}
                  <span className="text-white font-semibold">{lvl}%</span>
                </span>
              </>
            )}
          </div>
        )}

        {/* 탭 행: ⚙️ | 4탭 */}
        <div className={`relative flex items-center transition-all duration-300 ${shrunk ? 'gap-0.5 px-1.5 py-1' : 'gap-1 px-2 py-1.5'}`}>
          <button
            type="button"
            onClick={() => setSettingsOpen(o => !o)}
            aria-expanded={settingsOpen}
            aria-haspopup="dialog"
            title="설정"
            className={`${shrunk ? 'p-3' : 'p-2'} rounded-full transition-colors flex-shrink-0 ${
              settingsOpen ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
            }`}
          >
            {GEAR_ICON}
            <span className="sr-only">설정</span>
          </button>
          <span className="h-6 w-px bg-white/[0.10] mx-0.5 flex-shrink-0" aria-hidden="true" />
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
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-2xl transition-colors min-w-[4.5rem] ${
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
    </>
  );
}
