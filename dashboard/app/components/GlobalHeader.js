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
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

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
    ? lastRefresh.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
    : carFetchedAt
      ? carFetchedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
      : null;

  const lastSeenLabel = car?.last_seen
    ? new Date(car.last_seen).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
    : null;

  const elapsedMin = car?.state_since
    ? Math.max(0, Math.floor((Date.now() - new Date(car.state_since).getTime()) / 60000))
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
          {(() => {
            // 상태별 아이콘/색상 맵
            const statusKey = isCharging ? 'charging' : (effectiveState || 'parked');
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
                // 화살표 (→)
                icon: <path d="M5 13h11.17l-4.88 4.88a.996.996 0 1 0 1.41 1.41l6.59-6.59a.996.996 0 0 0 0-1.41l-6.58-6.6a.996.996 0 1 0-1.41 1.41L16.17 11H5c-.55 0-1 .45-1 1s.45 1 1 1z" />,
              },
              parked: {
                label: '주차 중',
                cls: 'from-zinc-500/20 to-zinc-600/10 border-zinc-500/30',
                txt: 'text-zinc-300',
                // P 박스
                icon: <path d="M13 3H6v18h4v-6h3a6 6 0 0 0 0-12zm.2 8H10V7h3.2a2 2 0 1 1 0 4z" />,
              },
              suspended: {
                label: '절전 중',
                cls: 'from-indigo-500/20 to-indigo-600/10 border-indigo-500/30',
                txt: 'text-indigo-400',
                // 달 (sleep)
                icon: <path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z" />,
              },
              online: {
                label: '온라인',
                cls: 'from-teal-500/20 to-teal-600/10 border-teal-500/30',
                txt: 'text-teal-400',
                // wifi
                icon: <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3a4.237 4.237 0 0 0-6 0zm-4-4l2 2a7.074 7.074 0 0 1 10 0l2-2C15.14 9.14 8.87 9.14 5 13z" />,
              },
              offline: {
                label: '오프라인',
                cls: 'from-zinc-700/30 to-zinc-800/20 border-zinc-600/30',
                txt: 'text-zinc-500',
                // x-mark cloud
                icon: <path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zm-4.85 5.54L12 13.08l-2.5 2.5-1.08-1.08L10.92 12l-2.5-2.5L9.5 8.42 12 10.92l2.5-2.5 1.08 1.08L13.08 12l2.5 2.5-1.08 1.08z" />,
              },
            };
            const conf = MAP[statusKey] || MAP.parked;
            return (
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border transition-colors bg-gradient-to-br ${conf.cls}`}
                title={conf.label}
              >
                <svg className={`w-4 h-4 ${conf.txt}`} fill="currentColor" viewBox="0 0 24 24">
                  {conf.icon}
                </svg>
                <span className="sr-only">{conf.label}</span>
              </div>
            );
          })()}
          {(() => {
            const isOffline = !effectiveState || effectiveState === 'offline' || effectiveState === 'unknown';
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
          {elapsedMin != null && !isCharging && (
            <span className="text-[11px] tabular-nums text-zinc-500 flex-shrink-0">{formatDuration(elapsedMin)}</span>
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
            {elapsedMin != null && (
              <span className="text-zinc-600 text-[11px] tabular-nums truncate">+{formatDuration(elapsedMin)}</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {effectiveState && <StateBadge state={effectiveState} />}
            {estRange && (
              <span className="text-zinc-400 text-xs tabular-nums">예측 {estRange}<span className="text-zinc-600 text-[10px] ml-0.5">km</span></span>
            )}
            {(() => {
              const ec = car?.estimated_charge;
              if (!ec || ec.days_until == null) return null;
              // 신뢰도 낮으면 숨김 (운행 데이터 부족)
              if (ec.confidence === 'low') return null;
              const days = ec.days_until;
              // 3일 이상 여유면 노이즈라 숨김 (필요할 때만 표시)
              if (days > 2) return null;
              const label = days === 0 ? '오늘 충전 필요' : days === 1 ? '내일 충전' : '2일 뒤 충전';
              const colorCls = days === 0 ? 'text-red-400' : days === 1 ? 'text-amber-400' : 'text-zinc-400';
              return <span className={`text-xs tabular-nums font-bold ${colorCls}`}>⚡ {label}</span>;
            })()}
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
