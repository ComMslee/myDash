'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useMock, MOCK_DATA } from '../context/mock';
import { formatDuration } from '../../lib/format';

// GlobalHeader를 숨길 경로 (서브/상세 페이지)
const HIDDEN_ROUTES = ['/rankings', '/v1/rankings'];

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
  const [rawChargingStatus, setRawChargingStatus] = useState(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const [, setTick] = useState(0);

  // 10연타로 디버그 바 토글 (2초 안에 안 터치하면 카운터 리셋)
  useEffect(() => {
    if (tapCount === 0) return;
    if (tapCount >= 10) {
      setDebugOpen(v => !v);
      setTapCount(0);
      return;
    }
    const t = setTimeout(() => setTapCount(0), 2000);
    return () => clearTimeout(t);
  }, [tapCount]);

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
        setRawChargingStatus(chargingData);
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

  const remainMin = charging?.time_to_full_charge ? Math.round(charging.time_to_full_charge * 60) : null;

  // 충전 진행률 (현재% → 목표%)
  const startLvl = charging?.start_battery_level ?? (lvl > 10 ? lvl - 10 : 0);
  const chargePctDenom = limitLvl - startLvl;
  const chargePct = limitLvl && limitLvl > lvl && chargePctDenom > 0
    ? Math.max(0, Math.min(100, Math.round(((lvl - startLvl) / chargePctDenom) * 100)))
    : null;

  return (
    <header
      className="sticky top-0 z-50 bg-[#0f0f0f]/90 backdrop-blur border-b border-white/[0.06] relative overflow-hidden"
      onClick={() => setTapCount(c => c + 1)}
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
      {/* 충전 시작 SOC 세로선 — 게이지 위에 시작점 표시 (delta 가시화) */}
      {isCharging && charging?.start_battery_level != null && charging.start_battery_level < lvl && (
        <div
          className="absolute inset-y-0 w-px bg-emerald-300/70 pointer-events-none"
          style={{ left: `${charging.start_battery_level}%` }}
          aria-hidden="true"
        />
      )}
      {/* 충전 진행 화살표 — 현재 SOC 위치에 진행 방향 시각화 */}
      {isCharging && charging?.start_battery_level != null && charging.start_battery_level < lvl && (
        <span
          className="absolute top-1/2 -translate-y-1/2 text-emerald-300 text-[10px] font-bold pointer-events-none -translate-x-full pr-0.5"
          style={{ left: `${lvl}%` }}
          aria-hidden="true"
        >
          ▶
        </span>
      )}
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

        {/* 우측: 충전중 or 일반 상태 */}
        {isCharging ? (
          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" aria-hidden="true" />
              <span className="text-green-400 text-sm font-bold tabular-nums">
                {charging?.charger_power != null ? `${charging.charger_power}kW` : '충전 중'}
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

      {/* DEBUG: 충전 감지 진단 (헤더 10연타로 토글) */}
      {debugOpen && (
        <div className="bg-zinc-900/80 border-t border-white/5 px-3 py-1 text-[10px] tabular-nums text-zinc-400 flex flex-wrap gap-x-3 gap-y-0.5 font-mono">
          <span>state=<span className="text-zinc-200">{car?.state ?? '—'}</span></span>
          <span>charging={String(!!rawChargingStatus?.charging)}</span>
          {rawChargingStatus?.fallback && (
            <span className="text-amber-400">fb={rawChargingStatus.fallback_reason}</span>
          )}
          {rawChargingStatus?.debug && (
            <>
              <span>pwr=<span className="text-zinc-200">{rawChargingStatus.debug.latest_power ?? 'null'}</span></span>
              <span>lvl=<span className="text-zinc-200">{rawChargingStatus.debug.recent_level ?? 'null'}→{rawChargingStatus.debug.older_level ?? 'null'}</span></span>
              <span>pSig={String(rawChargingStatus.debug.power_signal)}</span>
              <span>lSig={String(rawChargingStatus.debug.level_signal)}</span>
            </>
          )}
          <span>isCharging={String(isCharging)}</span>
          <span>display={displayState}</span>
        </div>
      )}
      {/* 10연타 카운터 힌트 (5타 이상부터 표시) */}
      {!debugOpen && tapCount >= 5 && (
        <div className="bg-zinc-900/80 border-t border-white/5 px-3 py-0.5 text-[10px] text-zinc-500 text-center font-mono">
          디버그 {tapCount}/10
        </div>
      )}
    </header>
  );
}
