'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useMock, MOCK_DATA } from './context/mock';
import { KWH_PER_KM, RATED_RANGE_MAX_KM } from '../lib/constants';
import { formatDuration, shortAddr } from '../lib/format';
import { Card } from './components/PageLayout';
import { CombinedHourlyHeatmap, CombinedWeekdayBars } from './components/ChartWidgets';

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
    { label: '오늘',   km: drives?.today_distance ?? 0,     kwh: drives?.today_energy_kwh ?? 0 },
    { label: '이번주', km: drives?.week_distance ?? 0,      kwh: drives?.week_energy_kwh ?? 0 },
    { label: '저번주', km: drives?.prev_week_distance ?? 0, kwh: drives?.prev_week_energy_kwh ?? 0 },
    { label: '이번달', km: drives?.month_distance ?? 0,     kwh: drives?.month_energy_kwh ?? 0 },
  ];

  return (
    <Card className="!p-0 overflow-hidden">
      {/* 4칸 통계 — 헤더 + km + kWh + 효율 */}
      <div className="grid grid-cols-4 border-b border-white/[0.06]">
        {/* 라벨 행 */}
        {stats.map((s, i) => (
          <div key={s.label} className={`pt-3 pb-1 text-center ${i < 3 ? 'border-r border-white/[0.06]' : ''}`}>
            <p className="text-[11px] text-zinc-500 tracking-wide">{s.label}</p>
          </div>
        ))}
        {/* km 행 */}
        {stats.map((s, i) => (
          <div key={`km-${s.label}`} className={`py-1 text-center ${i < 3 ? 'border-r border-white/[0.06]' : ''}`}>
            <p className="text-xl font-black tabular-nums leading-none text-blue-400">
              {s.km}<span className="text-[10px] font-semibold text-zinc-600 ml-0.5">km</span>
            </p>
          </div>
        ))}
        {/* kWh 행 */}
        {stats.map((s, i) => (
          <div key={`kwh-${s.label}`} className={`py-1 text-center ${i < 3 ? 'border-r border-white/[0.06]' : ''}`}>
            <p className="text-sm font-bold tabular-nums leading-none text-green-400">
              {s.kwh}<span className="text-[10px] font-medium text-zinc-600 ml-0.5">kWh</span>
            </p>
          </div>
        ))}
        {/* 효율 행 */}
        {stats.map((s, i) => (
          <div key={`eff-${s.label}`} className={`pb-3 pt-1 text-center ${i < 3 ? 'border-r border-white/[0.06]' : ''}`}>
            <p className="text-sm font-bold tabular-nums leading-none text-amber-400">
              {s.km > 0 && s.kwh > 0 ? (s.kwh / s.km * 1000).toFixed(0) : 0}
              <span className="text-[10px] font-medium text-zinc-600 ml-0.5">Wh/k</span>
            </p>
          </div>
        ))}
      </div>

      {/* 주행 목록 */}
      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="px-4 py-4 text-center text-red-400 text-sm">데이터를 불러오지 못했습니다</div>
      ) : !list?.length ? (
        <div className="px-4 py-4 text-center text-zinc-600 text-sm">주행 기록이 없습니다</div>
      ) : (
        <div>
          {list.slice(0, 3).map((d) => {
            const startPct = d.start_battery_level ?? (d.start_rated_range_km != null ? Math.min(100, Math.round(d.start_rated_range_km / RATED_RANGE_MAX_KM * 100)) : null);
            const endPct   = d.end_battery_level   ?? (d.end_rated_range_km   != null ? Math.min(100, Math.round(d.end_rated_range_km   / RATED_RANGE_MAX_KM * 100)) : null);
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
                className="grid grid-cols-[52px_1fr_auto] items-center gap-2 px-3.5 py-2.5 border-b border-white/[0.06] last:border-0 hover:bg-white/[0.025] transition-colors"
              >
                <div className="text-xs text-zinc-500 leading-tight tabular-nums">
                  <p className="text-zinc-300 font-bold text-sm">{dateLabel}</p>
                  <p>{timeLabel}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-zinc-300 truncate">
                    {shortAddr(d.start_address) || '?'}<span className="text-zinc-500 mx-1">&rarr;</span>{shortAddr(d.end_address) || '?'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-zinc-600 tabular-nums">{formatDuration(d.duration_min)}</span>
                    {startPct != null && endPct != null && (
                      <div className="flex items-center gap-1 text-xs text-zinc-500 tabular-nums">
                        <div className="w-20 h-1.5 bg-zinc-800 rounded-sm overflow-hidden relative">
                          <div className="absolute inset-y-0 rounded-sm bg-blue-400/30" style={{ left: `${endPct}%`, width: `${startPct - endPct}%` }} />
                          <div className="absolute inset-y-0 rounded-sm bg-green-400/40" style={{ left: 0, width: `${endPct}%` }} />
                        </div>
                        <span>{startPct}<span className="text-zinc-600">{'>'}</span>{endPct}%</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-blue-400 tabular-nums">{d.distance}<span className="text-xs font-medium text-zinc-600 ml-0.5">km</span></p>
                  {kwh && <p className="text-xs text-green-400/80 tabular-nums">{kwh}<span className="text-xs ml-0.5">kWh</span></p>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── 기간 통합 카드 ─────────────────────────────────────────

const PERIOD_TABS = [
  { key: 3,  label: '3개월' },
  { key: 6,  label: '6개월' },
  { key: 12, label: '12개월' },
];

function PeriodCard({ insights }) {
  const [period, setPeriod] = useState(6);

  const dataKey = period === 3 ? 'threeMonth' : period === 6 ? 'sixMonth' : 'twelveMonth';
  const c = insights?.[dataKey];

  const homeRatio  = c && c.charge_count > 0 ? c.home_charges  / c.charge_count : 0;
  const otherRatio = c && c.charge_count > 0 ? c.other_charges / c.charge_count : 0;
  const slow = c?.slow_charges || 0;
  const fast = c?.fast_charges || 0;
  const total = slow + fast;
  const slowPct = total > 0 ? slow / total : 0;
  const fastPct = total > 0 ? fast / total : 0;

  return (
    <Card className="!p-0 overflow-hidden">
      {/* 탭 */}
      <div className="grid grid-cols-3 border-b border-white/[0.06]">
        {PERIOD_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setPeriod(t.key)}
            className={`py-4 text-base font-bold tracking-wide transition-colors ${
              period === t.key
                ? 'text-blue-400 bg-blue-400/10'
                : 'text-zinc-500 hover:text-zinc-300'
            } ${t.key !== 12 ? 'border-r border-white/[0.06]' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!c ? (
        <Spinner />
      ) : (
        <>
          {/* 주행 통계 — 3×2 그리드 */}
          <div className="grid grid-cols-3">
            <div className="px-2 py-4 text-center border-r border-b border-white/[0.06]">
              <p className="text-zinc-600 text-xs mb-1.5">횟수</p>
              <p className="text-white font-bold text-lg leading-none tabular-nums">{c.drive_count}</p>
              <p className="text-zinc-600 text-xs mt-1.5">회</p>
            </div>
            <div className="px-2 py-4 text-center border-r border-b border-white/[0.06]">
              <p className="text-zinc-600 text-xs mb-1.5">거리</p>
              <p className="text-blue-400 font-bold text-lg leading-none tabular-nums">{c.distance}</p>
              <p className="text-zinc-600 text-xs mt-1.5">km</p>
            </div>
            <div className="px-2 py-4 text-center border-b border-white/[0.06]">
              <p className="text-zinc-600 text-xs mb-1.5">효율</p>
              <p className="text-amber-400 font-bold text-lg leading-none tabular-nums">{c.efficiency_wh_km || '—'}</p>
              <p className="text-zinc-600 text-xs mt-1.5">Wh/km</p>
            </div>
            <div className="px-2 py-4 text-center border-r border-white/[0.06]">
              <p className="text-zinc-600 text-xs mb-1.5">최장 거리</p>
              <p className="text-blue-400/80 font-bold text-lg leading-none tabular-nums">{c.max_distance}</p>
              <p className="text-zinc-600 text-xs mt-1.5">km</p>
            </div>
            <div className="px-2 py-4 text-center border-r border-white/[0.06]">
              <p className="text-zinc-600 text-xs mb-1.5">최장 시간</p>
              <p className="text-zinc-300 font-bold text-base leading-none tabular-nums">{formatDuration(c.max_duration)}</p>
            </div>
            <div className="px-2 py-4 text-center">
              <p className="text-zinc-600 text-xs mb-1.5">평균 속도</p>
              <p className="text-zinc-300 font-bold text-lg leading-none tabular-nums">{c.avg_speed}</p>
              <p className="text-zinc-600 text-xs mt-1.5">km/h</p>
            </div>
          </div>

          {/* 충전 요약 */}
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
            <div className="flex justify-between text-xs mb-1.5 mt-3">
              <span className="text-blue-400">완속 {slow}회</span>
              <span className="text-rose-400">급속 {fast}회</span>
            </div>
            <div className="h-2.5 bg-zinc-800 rounded-full overflow-hidden flex">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${slowPct * 100}%` }} />
              <div className="h-full bg-rose-500 transition-all" style={{ width: `${fastPct * 100}%` }} />
            </div>
            <div className="flex justify-between text-xs text-zinc-600 mt-1">
              <span>{(slowPct * 100).toFixed(0)}%</span>
              <span>{(fastPct * 100).toFixed(0)}%</span>
            </div>
          </div>

          {/* 시간대/요일 패턴 (12개월 기준) */}
          {insights.hourly && insights.charge_hourly && (
            <div className="px-4 pt-4 pb-4 border-t border-white/[0.06]">
              <p className="text-[11px] text-zinc-600 uppercase tracking-wider mb-2">시간대</p>
              <CombinedHourlyHeatmap driveData={insights.hourly} chargeData={insights.charge_hourly} />
              <p className="text-[11px] text-zinc-600 uppercase tracking-wider mt-4 mb-2">요일</p>
              <CombinedWeekdayBars driveData={insights.weekday} chargeData={insights.charge_weekday} />
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ── 메인 대시보드 ──────────────────────────────────────────

export default function Dashboard() {
  const { isMock, refreshSignal, setLastRefresh } = useMock();

  const [drives, setDrives] = useState(null);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState({ drives: true, insights: true });
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
  const displayInsights = isMock ? MOCK_DATA.insights : insights;
  const displayLoading  = isMock ? { drives: false, insights: false } : loading;

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

        {/* 2. 기간별 통계 */}
        <div>
          <SectionHeader title="기간별 통계" />
          <PeriodCard insights={displayInsights} />
        </div>

      </main>
    </div>
  );
}
