'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useMock, MOCK_DATA } from './context/mock';
import { KWH_PER_KM, RATED_RANGE_MAX_KM } from '../lib/constants';
import { formatDuration, shortAddr } from '../lib/format';
import { Card } from './components/PageLayout';
import { HourlyHeatmap, WeekdayBars } from './components/ChartWidgets';

const REFRESH_INTERVAL = 30000;

// ── 공통 컴포넌트 ──────────────────────────────────────────

function SectionHeader({ title }) {
  return (
    <div className="flex items-center justify-between mb-2 px-1">
      <span className="text-xs font-bold tracking-widest text-zinc-500 uppercase">{title}</span>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-6">
      <div className="w-6 h-6 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
    </div>
  );
}

// ── 주행거리 섹션 ───────────────────────────────────────────

function DrivesSection({ drives, loading, error }) {
  const list = drives?.recent_drives;

  const stats = [
    { label: '오늘',   km: drives?.today_distance ?? 0,     kwh: drives?.today_energy_kwh ?? 0,    color: 'text-white' },
    { label: '이번주', km: drives?.week_distance ?? 0,      kwh: drives?.week_energy_kwh ?? 0,     color: 'text-blue-400' },
    { label: '저번주', km: drives?.prev_week_distance ?? 0, kwh: drives?.prev_week_energy_kwh ?? 0, color: 'text-zinc-400' },
    { label: '이번달', km: drives?.month_distance ?? 0,     kwh: drives?.month_energy_kwh ?? 0,    color: 'text-indigo-400' },
  ];

  return (
    <Card className="!p-0 overflow-hidden">
      {/* 거리 통계 — 2×2 그리드 */}
      <div className="grid grid-cols-2">
        {stats.map((s, i) => (
          <div key={s.label} className={`px-3 py-4 text-center ${i % 2 === 0 ? 'border-r' : ''} ${i < 2 ? 'border-b' : ''} border-white/[0.06]`}>
            <p className="text-xs text-zinc-500 mb-1 tracking-wide">{s.label}</p>
            <div className="flex items-baseline justify-center gap-1.5">
              <p className={`text-4xl font-black tabular-nums leading-none ${s.color}`}>{s.km}<span className="text-xs font-semibold text-zinc-600 ml-0.5">km</span></p>
              <p className="text-xs text-green-400/85 tabular-nums">{s.kwh}<span className="text-[10px] ml-0.5">kWh</span></p>
            </div>
          </div>
        ))}
      </div>

      {/* 주행 목록 */}
      {loading ? (
        <div className="border-t border-white/[0.06]"><Spinner /></div>
      ) : error ? (
        <div className="border-t border-white/[0.06] px-4 py-4 text-center text-red-400 text-sm">데이터를 불러오지 못했습니다</div>
      ) : !list?.length ? (
        <div className="border-t border-white/[0.06] px-4 py-4 text-center text-zinc-600 text-sm">주행 기록이 없습니다</div>
      ) : (
        <div className="border-t border-white/[0.06]">
          {list.slice(0, 3).map((d) => {
            const startPct = d.start_battery_level ?? (d.start_rated_range_km != null ? Math.min(100, Math.round(d.start_rated_range_km / RATED_RANGE_MAX_KM * 100)) : null);
            const endPct   = d.end_battery_level   ?? (d.end_rated_range_km   != null ? Math.min(100, Math.round(d.end_rated_range_km   / RATED_RANGE_MAX_KM * 100)) : null);
            const usedPct = startPct != null && endPct != null ? Math.max(0, startPct - endPct) : 0;
            const kwh = (d.start_rated_range_km != null && d.end_rated_range_km != null)
              ? ((d.start_rated_range_km - d.end_rated_range_km) * KWH_PER_KM).toFixed(1)
              : null;
            const dt = new Date(d.start_date);
            const dateLabel = `${dt.getMonth()+1}/${dt.getDate()}`;
            const timeLabel = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
            return (
              <Link
                key={d.id}
                href={`/drives?id=${d.id}`}
                className="grid grid-cols-[62px_1fr_auto] items-center gap-2.5 px-3.5 py-3 border-b border-white/[0.06] last:border-0 hover:bg-white/[0.025] transition-colors"
              >
                {/* 좌측: 날짜 + 시각 */}
                <div className="text-xs text-zinc-500 leading-tight tabular-nums">
                  <p className="text-zinc-300 font-bold text-sm">{dateLabel}</p>
                  <p>{timeLabel}</p>
                </div>
                {/* 중앙: 경로 + 메타 */}
                <div className="min-w-0">
                  <p className="text-sm text-zinc-300 truncate">
                    {shortAddr(d.start_address) || '?'}<span className="text-zinc-500 mx-1">&rarr;</span>{shortAddr(d.end_address) || '?'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-zinc-600 tabular-nums">{formatDuration(d.duration_min)}</span>
                    {/* 배터리 막대 */}
                    {startPct != null && endPct != null && (
                      <div className="flex items-center gap-1 text-xs text-zinc-500 tabular-nums">
                        <span>{startPct}%</span>
                        <div className="w-11 h-1.5 bg-zinc-700 rounded-sm overflow-hidden relative">
                          <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${usedPct}%`, background: 'linear-gradient(90deg, rgba(96,165,250,.5), rgba(248,113,113,.6))' }} />
                        </div>
                        <span>{endPct}%</span>
                      </div>
                    )}
                  </div>
                </div>
                {/* 우측: km + kWh */}
                <div className="text-right">
                  <p className="text-base font-bold text-blue-400 tabular-nums">{d.distance}<span className="text-xs font-medium text-zinc-600 ml-0.5">km</span></p>
                  {kwh && <p className="text-xs text-green-400/85 tabular-nums">{kwh}<span className="text-[10px] ml-0.5">kWh</span></p>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── 최근 6개월 통합 카드 ────────────────────────────────────

function SixMonthCard({ insights }) {
  if (!insights?.sixMonth) return null;

  const c = insights.sixMonth;
  const bd = insights.monthlyBreakdown || [];

  const avgKm = c.drive_count > 0 ? (c.distance / c.drive_count).toFixed(0) : 0;
  const avgMin = c.drive_count > 0 ? Math.round(c.duration_min / c.drive_count) : 0;
  const homeRatio = c.charge_count > 0 ? c.home_charges / c.charge_count : 0;
  const otherRatio = c.charge_count > 0 ? c.other_charges / c.charge_count : 0;
  const maxBdDist = bd.length > 0 ? Math.max(1, ...bd.map(m => m.distance)) : 1;

  return (
    <Card className="!p-0 overflow-hidden">
      {/* 주행 통계 — 4열 그리드 */}
      <div className="grid grid-cols-4 divide-x divide-white/[0.06]">
        <div className="px-2 py-4 text-center">
          <p className="text-zinc-600 text-xs mb-1.5">횟수</p>
          <p className="text-white font-bold text-lg leading-none tabular-nums">{c.drive_count}</p>
          <p className="text-zinc-600 text-xs mt-1.5">회</p>
        </div>
        <div className="px-2 py-4 text-center">
          <p className="text-zinc-600 text-xs mb-1.5">거리</p>
          <p className="text-blue-400 font-bold text-lg leading-none tabular-nums">{c.distance}</p>
          <p className="text-zinc-600 text-xs mt-1.5">km</p>
        </div>
        <div className="px-2 py-4 text-center">
          <p className="text-zinc-600 text-xs mb-1.5">평균 트립</p>
          <p className="text-zinc-300 font-bold text-lg leading-none tabular-nums">{avgKm}</p>
          <p className="text-zinc-600 text-xs mt-1.5">km · {avgMin}분</p>
        </div>
        <div className="px-2 py-4 text-center">
          <p className="text-zinc-600 text-xs mb-1.5">효율</p>
          <p className="text-amber-400 font-bold text-lg leading-none tabular-nums">{c.efficiency_wh_km || '—'}</p>
          <p className="text-zinc-600 text-xs mt-1.5">Wh/km</p>
        </div>
      </div>

      {/* 최고 기록 — 한 줄 요약 + 월별 미니 바 차트 */}
      <div className="px-4 py-3 border-t border-white/[0.06]">
        <div className="flex items-center justify-center gap-4 text-xs tabular-nums">
          <span className="text-zinc-500">최장 <span className="text-zinc-300 font-bold">{c.max_distance}</span><span className="text-zinc-600 ml-0.5">km</span></span>
          <span className="text-zinc-700">·</span>
          <span className="text-zinc-500">최장 <span className="text-zinc-300 font-bold">{formatDuration(c.max_duration)}</span></span>
          <span className="text-zinc-700">·</span>
          <span className="text-zinc-500">평균 <span className="text-zinc-300 font-bold">{c.avg_speed}</span><span className="text-zinc-600 ml-0.5">km/h</span></span>
        </div>
        {bd.length > 0 && (
          <div className="flex items-end gap-1 mt-3 h-10">
            {bd.map(m => {
              const pct = maxBdDist > 0 ? (m.distance / maxBdDist) * 100 : 0;
              return (
                <div key={`${m.year}-${m.month}`} className="flex-1 flex flex-col items-center justify-end h-full gap-0.5">
                  <div className="w-full rounded-sm overflow-hidden bg-zinc-800/40 relative" style={{ height: '100%' }}>
                    <div
                      className="absolute bottom-0 inset-x-0 bg-blue-500 rounded-sm transition-all"
                      style={{ height: `${pct}%`, opacity: 0.3 + (pct / 100) * 0.7 }}
                    />
                  </div>
                  <span className="text-[9px] text-zinc-600 tabular-nums">{m.month}월</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 충전 요약 + 비율 바 통합 */}
      <div className="px-4 py-3 border-t border-white/[0.06]">
        <div className="flex items-baseline justify-between mb-2.5">
          <div className="flex items-baseline gap-3">
            <span className="text-white font-bold text-base tabular-nums">{c.charge_count}<span className="text-zinc-600 text-xs ml-0.5">회</span></span>
            <span className="text-green-400 font-bold text-base tabular-nums">{c.total_kwh}<span className="text-zinc-600 text-xs ml-0.5">kWh</span></span>
          </div>
          <span className="text-zinc-500 text-xs tabular-nums">평균 <span className="text-green-400/85 font-semibold">{c.avg_kwh}</span> kWh/회</span>
        </div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-emerald-400">집충전 {c.home_charges}회</span>
          <span className="text-amber-400">외부충전 {c.other_charges}회</span>
        </div>
        <div className="h-2.5 bg-zinc-800 rounded-full overflow-hidden flex">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${homeRatio * 100}%` }} />
          <div className="h-full bg-amber-500 transition-all" style={{ width: `${otherRatio * 100}%` }} />
        </div>
        <div className="flex justify-between text-xs text-zinc-600 mt-1">
          <span>{(homeRatio * 100).toFixed(0)}%</span>
          <span>{(otherRatio * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* 시간대/요일 패턴 */}
      {insights.hourly && (
        <div className="px-4 pt-4 pb-4 border-t border-white/[0.06]">
          <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1.5">시간대별 주행</p>
          <HourlyHeatmap data={insights.hourly} hexColor="#3b82f6" valueKey="count" />
          <p className="text-[9px] text-zinc-600 uppercase tracking-wider mt-4 mb-1.5">요일별 주행</p>
          <WeekdayBars data={insights.weekday} hexColor="#3b82f6" valueKey="count" />
        </div>
      )}
      {insights.charge_hourly && (
        <div className="px-4 pt-4 pb-4 border-t border-white/[0.06]">
          <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1.5">시간대별 충전</p>
          <HourlyHeatmap data={insights.charge_hourly} hexColor="#22c55e" valueKey="count" />
          <p className="text-[9px] text-zinc-600 uppercase tracking-wider mt-4 mb-1.5">요일별 충전</p>
          <WeekdayBars data={insights.charge_weekday} hexColor="#22c55e" valueKey="count" />
        </div>
      )}
    </Card>
  );
}

// ── 메인 대시보드 ──────────────────────────────────────────

export default function Dashboard() {
  const { isMock, refreshSignal, setLastRefresh } = useMock();

  const [drives, setDrives] = useState(null);
  const [charges, setCharges] = useState(null);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState({
    drives: true, charges: true, insights: true,
  });
  const [errors, setErrors] = useState({});

  const fetchAll = useCallback(async () => {
    if (isMock) return;
    const fetcher = async (url, key, setter) => {
      try {
        const data = await fetch(url).then(r => r.json());
        setter(data);
      } catch (e) {
        console.error(`fetch ${url}:`, e);
        setErrors(prev => ({ ...prev, [key]: true }));
      } finally {
        setLoading(prev => ({ ...prev, [key]: false }));
      }
    };
    await Promise.all([
      fetcher('/api/drives', 'drives', setDrives),
      fetcher('/api/charges', 'charges', setCharges),
      fetcher('/api/insights', 'insights', setInsights),
    ]);
    setLastRefresh(new Date());
  }, [isMock, setLastRefresh]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll, refreshSignal]);

  useEffect(() => {
    if (isMock) return;
    const id = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchAll, isMock]);

  const displayDrives   = isMock ? MOCK_DATA.drives   : drives;
  const displayCharges  = isMock ? MOCK_DATA.charges  : charges;
  const displayInsights = isMock ? MOCK_DATA.insights : insights;
  const displayLoading  = isMock
    ? { drives: false, charges: false, insights: false }
    : loading;

  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      <main className="max-w-2xl mx-auto px-4 py-5 pb-12 space-y-6">

        {/* 1. 최근 주행 */}
        <div>
          <SectionHeader title="최근 주행" />
          <DrivesSection
            drives={displayDrives}
            loading={displayLoading.drives}
            error={!isMock && errors.drives}
          />
        </div>

        {/* 2. 최근 6개월 */}
        <div>
          <SectionHeader title="최근 6개월" />
          <SixMonthCard insights={displayInsights} />
        </div>

      </main>
    </div>
  );
}
