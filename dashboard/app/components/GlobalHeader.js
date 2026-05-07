'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useMock, MOCK_DATA } from '../context/mock';
import { formatDuration } from '../../lib/format';

// GlobalHeader를 숨길 경로 (서브/상세 페이지)
const HIDDEN_ROUTES = ['/rankings'];

function StateBadge({ state }) {
  const map = {
    driving:   { label: '주행 중',   cls: 'text-blue-400' },
    parked:    { label: '주차 중',   cls: 'text-zinc-400' },
    suspended: { label: '절전 중',   cls: 'text-indigo-400' },
    online:    { label: '온라인',    cls: 'text-teal-400' },
  };
  if (!state || state === 'offline' || state === 'charging') return null;
  const s = map[state];
  if (!s) return null;
  return <span className={`text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

function PercentBadge({ level, color, charging }) {
  return (
    <div
      className="flex items-center gap-1"
      role="progressbar"
      aria-valuenow={level}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="배터리 잔량"
    >
      {charging && (
        <span className="text-[10px] text-green-400 animate-pulse" aria-hidden="true">⚡</span>
      )}
      <span className="text-sm font-bold tabular-nums" style={{ color }}>{level}%</span>
    </div>
  );
}

export default function GlobalHeader() {
  const pathname = usePathname();
  const { isMock, toggleMock, isMockCharging, toggleMockCharging, lastRefresh, mockData } = useMock();
  const [car, setCar] = useState(null);
  const [charging, setCharging] = useState(null);
  const [carFetchedAt, setCarFetchedAt] = useState(null);

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
  const lvl = isCharging ? (charging.battery_level ?? car?.battery_level ?? 0) : (car?.battery_level ?? 0);
  const limitLvl = charging?.charge_limit_soc ?? null;
  const estRange = car?.est_battery_range ?? null;
  const color = lvl > 50 ? '#22c55e' : lvl > 20 ? '#f59e0b' : '#ef4444';

  const timeLabel = lastRefresh
    ? lastRefresh.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : carFetchedAt
      ? carFetchedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      : null;

  const lastSeenLabel = car?.last_seen
    ? new Date(car.last_seen).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : null;

  const remainMin = charging?.time_to_full_charge ? Math.round(charging.time_to_full_charge * 60) : null;

  // 충전 진행률 (현재% → 목표%)
  const startLvl = charging?.start_battery_level ?? (lvl > 10 ? lvl - 10 : 0);
  const chargePctDenom = limitLvl - startLvl;
  const chargePct = limitLvl && limitLvl > lvl && chargePctDenom > 0
    ? Math.max(0, Math.min(100, Math.round(((lvl - startLvl) / chargePctDenom) * 100)))
    : null;

  return (
    <header className="sticky top-0 z-50 bg-[#0f0f0f]/90 backdrop-blur border-b border-white/[0.06] relative overflow-hidden">
      {/* 배터리 게이지 — 헤더 배경 */}
      <div
        className="absolute inset-y-0 left-0 transition-all duration-700 pointer-events-none"
        style={{
          width: `${lvl}%`,
          background: `linear-gradient(90deg, ${color}3d 0%, ${color}22 70%, ${color}0a 100%)`,
        }}
        aria-hidden="true"
      />
      {/* 충전 목표 지점 세로선 */}
      {isCharging && limitLvl && limitLvl > lvl && (
        <div
          className="absolute inset-y-0 w-px bg-white/30 pointer-events-none"
          style={{ left: `${limitLvl}%` }}
          aria-hidden="true"
        />
      )}
      <div className="relative max-w-2xl mx-auto px-4 py-2 flex items-center gap-2">

        {/* 좌측: 아이콘 + 차량명 + 갱신시간 */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border transition-colors ${
              isCharging
                ? 'bg-gradient-to-br from-green-500/25 to-green-600/10 border-green-500/40 charge-pulse'
                : 'bg-gradient-to-br from-red-500/20 to-red-600/10 border-red-500/30'
            }`}
            title={isCharging ? '충전 중' : '주차 중'}
            style={isCharging ? { color: '#34d399' } : undefined}
          >
            {isCharging ? (
              <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 17h2v2a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-2zM3 17h2v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2h1zm15-7l1.68 4h-15.36L6 10h12zm-14 6h16v-3h-16v3zm.5-5l2.5-5c.36-.72 1.09-1 1.83-1h8.34c.74 0 1.47.28 1.83 1l2.5 5h-17z"/>
              </svg>
            )}
            <span className="sr-only">{isCharging ? '충전중' : '주차중'}</span>
          </div>
          <span className="font-semibold text-zinc-200 text-base truncate">
            {car?.name || 'TeslaMate'}
          </span>
          {(lastSeenLabel || timeLabel) && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800/80 border border-white/5 text-zinc-500 flex-shrink-0">
              <span className="text-[11px] tabular-nums">{lastSeenLabel ?? timeLabel}</span>
            </span>
          )}
        </div>

        <div className="flex-1" />

        {/* 우측: 충전중 or 일반 상태 */}
        {isCharging ? (
          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" aria-hidden="true" />
              <span className="text-green-400 text-sm font-bold tabular-nums">
                {charging.charger_power != null ? `${charging.charger_power}kW` : '충전 중'}
              </span>
            </div>
            <PercentBadge level={lvl} color={color} charging />
            {limitLvl && <span className="text-zinc-600 text-[11px] tabular-nums flex-shrink-0">→{limitLvl}%</span>}
            {remainMin != null && (
              <span className="text-zinc-500 text-[11px] tabular-nums truncate">{formatDuration(remainMin)}</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {effectiveState && <StateBadge state={effectiveState} />}
            {estRange && (
              <span className="text-zinc-400 text-xs tabular-nums">예측 {estRange}<span className="text-zinc-600 text-[10px] ml-0.5">km</span></span>
            )}
            <PercentBadge level={lvl} color={color} charging={false} />
          </div>
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
  );
}
