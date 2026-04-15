'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useMock, MOCK_DATA } from '../context/mock';
import { formatDuration } from '../../lib/format';
import { effColor } from '../../lib/effColor';
import { Spinner, SectionLabel } from '@/app/components/PageLayout';
import { HourlyHeatmap, WeekdayBars } from '@/app/components/ChartWidgets';
import YearHeatmap from '@/app/components/YearHeatmap';

// ── 기간별 통계 섹션 (오늘/이번주/저번주) ─────────────────
function PeriodStats({ drives }) {
  const stats = [
    { label: '오늘',   km: drives?.today_distance ?? 0,     kwh: drives?.today_energy_kwh ?? 0 },
    { label: '이번주', km: drives?.week_distance ?? 0,      kwh: drives?.week_energy_kwh ?? 0 },
    { label: '저번주', km: drives?.prev_week_distance ?? 0, kwh: drives?.prev_week_energy_kwh ?? 0 },
  ];

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      {stats.map((s, i) => {
        const eff = s.km > 0 && s.kwh > 0 ? (s.kwh / s.km * 1000).toFixed(0) : null;
        const isEmpty = s.km === 0 && s.kwh === 0;
        return (
          <div key={s.label} className={`grid grid-cols-4 px-4 py-3 items-center ${i < stats.length - 1 ? 'border-b border-white/[0.04]' : ''}`}>
            <div>
              <span className="text-xs font-bold text-zinc-400">{s.label}</span>
            </div>
            <div className="text-center">
              {isEmpty ? (
                <span className="text-base font-black tabular-nums text-zinc-700">—</span>
              ) : (
                <>
                  <span className="text-lg font-black tabular-nums leading-none text-blue-400">{s.km}</span>
                  <span className="text-[10px] text-zinc-600 ml-0.5">km</span>
                </>
              )}
            </div>
            <div className="text-center">
              {isEmpty ? (
                <span className="text-sm font-bold tabular-nums text-zinc-700">—</span>
              ) : (
                <>
                  <span className="text-sm font-bold tabular-nums leading-none text-green-400">{s.kwh}</span>
                  <span className="text-[10px] text-zinc-600 ml-0.5">kWh</span>
                </>
              )}
            </div>
            <div className="text-center">
              {!eff ? (
                <span className="text-sm font-bold tabular-nums text-zinc-700">—</span>
              ) : (
                <>
                  <span className="text-sm font-bold tabular-nums leading-none text-amber-400">{eff}</span>
                  <span className="text-[10px] text-zinc-600 ml-0.5">Wh/km</span>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 기록 카드 — 3지표 × 2기준 테이블 (클릭 시 랭킹 페이지) ──

function RecordsCard({ allTime }) {
  if (!allTime) {
    return (
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-6 text-center text-zinc-600 text-xs">
        기록 데이터가 없습니다
      </div>
    );
  }

  const km  = (v) => <>{v}<span className="text-zinc-600 text-[11px] ml-0.5 font-normal">km</span></>;
  const kmh = (v) => <>{v}<span className="text-zinc-600 text-[11px] ml-0.5 font-normal">km/h</span></>;

  // 지표(행) × 기준(열) 구성
  const rows = [
    {
      label: '최장 거리',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      ),
      color: 'text-blue-400',
      drive: { value: km(allTime.max_distance),     rankType: 'drive_distance' },
      day:   { value: km(allTime.max_day_distance), rankType: 'day_distance'   },
    },
    {
      label: '최장 시간',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'text-zinc-200',
      drive: { value: formatDuration(allTime.max_duration),     rankType: 'drive_duration' },
      day:   { value: formatDuration(allTime.max_day_duration), rankType: 'day_duration'   },
    },
    {
      label: '평균 속도',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      color: 'text-amber-400',
      drive: { value: kmh(allTime.avg_speed),                      rankType: 'drive_avg_speed' },
      day:   { value: allTime.max_day_avg_speed != null ? kmh(allTime.max_day_avg_speed) : '—', rankType: 'day_avg_speed' },
    },
  ];

  const cellBase = 'py-3.5 text-center font-bold text-lg leading-none tabular-nums transition-colors';

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      {/* 헤더 — 공통 TOP 50 힌트 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
        <span className="text-[11px] font-bold tracking-widest uppercase text-zinc-500">전체 기간 기록</span>
        <span className="text-[10px] text-zinc-500">TOP 50 ›</span>
      </div>

      {/* 컬럼 헤더 */}
      <div className="grid grid-cols-[82px_1fr_1fr] bg-white/[0.02]">
        <div className="px-3 py-2 border-b border-white/[0.06]" />
        <div className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500 border-b border-l border-white/[0.06]">단일 주행</div>
        <div className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500 border-b border-l border-white/[0.06]">일 합계</div>
      </div>

      {/* 데이터 행들 */}
      <div className="grid grid-cols-[82px_1fr_1fr]">
        {rows.flatMap((r, i) => {
          const rowBorder = i < rows.length - 1 ? 'border-b border-white/[0.06]' : '';
          return [
            <div key={`l-${i}`} className={`px-3 py-3.5 flex items-center gap-1.5 ${rowBorder} ${r.color}`}>
              {r.icon}
              <span className="text-[11px] text-zinc-300 font-semibold">{r.label}</span>
            </div>,
            <Link
              key={`d-${i}`}
              href={`/rankings?type=${r.drive.rankType}`}
              className={`${cellBase} ${r.color} border-l border-white/[0.06] ${rowBorder} hover:bg-white/[0.03] active:bg-blue-500/10`}
            >
              {r.drive.value}
            </Link>,
            <Link
              key={`y-${i}`}
              href={`/rankings?type=${r.day.rankType}`}
              className={`${cellBase} ${r.color} border-l border-white/[0.06] ${rowBorder} hover:bg-white/[0.03] active:bg-blue-500/10`}
            >
              {r.day.value}
            </Link>,
          ];
        })}
      </div>
    </div>
  );
}

// ── 주행 패턴 카드 (시간대/요일, 전체 기간) ───────────────
function PatternCard({ hourly, weekday }) {
  if (!hourly || !weekday) return null;
  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-widest uppercase text-zinc-500">주행 패턴</span>
        <span className="text-[11px] text-zinc-500">전체 기간</span>
      </div>
      <div className="px-4 pt-4 pb-4">
        <p className="text-[11px] text-zinc-600 uppercase tracking-wider mb-2">시간대</p>
        <HourlyHeatmap data={hourly} hexColor="#3b82f6" />
        <p className="text-[11px] text-zinc-600 uppercase tracking-wider mt-4 mb-2">요일</p>
        <WeekdayBars data={weekday} hexColor="#3b82f6" />
      </div>
    </div>
  );
}

// ── 메인 페이지 ────────────────────────────────────────────
export default function DrivesPage() {
  const { isMock, refreshSignal } = useMock();

  const [drives, setDrives] = useState(null);
  const [insights, setInsights] = useState(null);
  const [yearHeatmap, setYearHeatmap] = useState(null);
  const [monthlyHistory, setMonthlyHistory] = useState(null);
  const [loading, setLoading] = useState({ drives: true, insights: true, heatmap: true, history: true });
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isMock) {
      setDrives(MOCK_DATA.drives);
      setInsights({
        ...MOCK_DATA.insights,
        allTime: {
          ...MOCK_DATA.insights.sixMonth,
          avg_speed: 42.3,
          max_day_distance: 248.7,
          max_day_duration: 320,
        },
      });
      setYearHeatmap(MOCK_DATA.yearHeatmap || null);
      setMonthlyHistory(MOCK_DATA.monthlyHistory || null);
      setLoading({ drives: false, insights: false, heatmap: false, history: false });
      return;
    }

    setError(null);

    fetch('/api/drives').then(r => r.json())
      .then(d => { setDrives(d); setLoading(p => ({ ...p, drives: false })); })
      .catch(() => { setError('데이터를 불러오지 못했습니다'); setLoading(p => ({ ...p, drives: false })); });

    fetch('/api/insights').then(r => r.json())
      .then(d => { setInsights(d); setLoading(p => ({ ...p, insights: false })); })
      .catch(() => setLoading(p => ({ ...p, insights: false })));

    fetch('/api/year-heatmap').then(r => r.json())
      .then(d => { setYearHeatmap(d); setLoading(p => ({ ...p, heatmap: false })); })
      .catch(() => setLoading(p => ({ ...p, heatmap: false })));

    fetch('/api/monthly-history').then(r => r.json())
      .then(d => { setMonthlyHistory(d); setLoading(p => ({ ...p, history: false })); })
      .catch(() => setLoading(p => ({ ...p, history: false })));
  }, [isMock, refreshSignal]);

  const months = monthlyHistory?.months || [];
  const driveDaysByYear = monthlyHistory?.driveDaysByYear || {};
  const seasonalEff = monthlyHistory?.seasonalEff || {};
  const now = new Date();
  const curYear = now.getFullYear();

  const byYear = {};
  for (const m of months) {
    if (!byYear[m.year]) byYear[m.year] = [];
    byYear[m.year].push(m);
  }
  const years = Object.keys(byYear).sort((a, b) => b - a);

  const yearTotals = {};
  for (const y of years) {
    const ms = byYear[y];
    const monthCount = ms.length;
    const totalKm = parseFloat(ms.reduce((s, m) => s + Number(m.total_distance_km || 0), 0).toFixed(1));
    const validWh = ms.filter(m => m.avg_wh_km != null).map(m => m.avg_wh_km);
    const avgWhKm = validWh.length > 0 ? validWh.reduce((s, v) => s + v, 0) / validWh.length : null;
    yearTotals[y] = {
      drive_count: ms.reduce((s, m) => s + Number(m.drive_count || 0), 0),
      total_distance_km: totalKm,
      total_duration_min: ms.reduce((s, m) => s + Number(m.total_duration_min || 0), 0),
      charge_count: ms.reduce((s, m) => s + Number(m.charge_count || 0), 0),
      total_energy_kwh: parseFloat(ms.reduce((s, m) => s + Number(m.total_energy_kwh || 0), 0).toFixed(1)),
      avg_monthly_km: monthCount > 0 ? Math.round(totalKm / monthCount) : 0,
      avg_wh_km: avgWhKm,
    };
  }

  const maxDist = months.length > 0 ? Math.max(...months.map(m => m.total_distance_km)) : 1;

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 py-5 pb-20 space-y-5">

        {/* 1. 기간별 통계 */}
        <div>
          <SectionLabel title="최근 주행" />
          {loading.drives ? <Spinner /> : <PeriodStats drives={drives} />}
        </div>

        {/* 2. 연간 히트맵 — 1년 시각적 요약 (주행만, 최신 왼쪽) */}
        <div>
          <SectionLabel title="연간 히트맵" />
          <YearHeatmap
            data={yearHeatmap}
            loading={loading.heatmap}
            title="지난 1년 주행"
            metric="km"
            color="#3b82f6"
            legendLabel="주행"
            latestLeft
          />
        </div>

        {/* 3. 주행 패턴 — 시간대/요일 반복 패턴 */}
        <div>
          <SectionLabel title="주행 패턴" />
          <PatternCard hourly={insights?.hourly} weekday={insights?.weekday} />
        </div>

        {/* 4. 기록 — 랭킹 진입점 */}
        <div>
          <SectionLabel title="기록" />
          <RecordsCard allTime={insights?.allTime} />
        </div>

        {/* 5. 연도별 월간 통계 */}
        {error ? (
          <p className="text-red-400 text-sm text-center py-8">{error}</p>
        ) : loading.history ? <Spinner /> : months.length === 0 ? (
          <p className="text-center text-zinc-600 py-8">데이터가 없습니다</p>
        ) : (
          <>
          <div className="space-y-4">
            <SectionLabel title="월별" />
            {years.map(year => {
              const t = yearTotals[year];
              const yr = parseInt(year);
              const isCurrentYear = yr === curYear;
              const totalDays = isCurrentYear
                ? Math.floor((Date.now() - new Date(`${yr}-01-01`).getTime()) / 86400000) + 1
                : (yr % 4 === 0 && (yr % 100 !== 0 || yr % 400 === 0)) ? 366 : 365;
              const driveDays = driveDaysByYear?.[yr] ?? 0;
              const noDriverDays = totalDays - driveDays;
              return (
                <div key={year} className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/[0.06]">
                    <div className="flex items-baseline gap-3">
                      <span className="text-base font-bold text-zinc-300">{year}</span>
                      <div className="flex items-baseline gap-2.5 text-xs tabular-nums">
                        <span className="text-white font-bold">{t.total_distance_km}<span className="text-zinc-600 ml-0.5">km</span></span>
                        <span className="text-blue-400/70">{t.drive_count}<span className="text-zinc-600 ml-0.5">회</span></span>
                        <span className="text-green-400/70">{t.total_energy_kwh}<span className="text-zinc-600 ml-0.5">kWh</span></span>
                      </div>
                      <div className="flex-1" />
                      {t.avg_wh_km != null && (
                        <span className="text-[11px] font-semibold tabular-nums" style={{ color: effColor(t.avg_wh_km) }}>
                          {t.avg_wh_km.toFixed(0)}<span className="text-zinc-700 ml-0.5">Wh/km</span>
                        </span>
                      )}
                      <span className="text-zinc-600 text-[11px]">월평균 <span className="text-zinc-400 font-medium">{t.avg_monthly_km}</span>km</span>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] text-zinc-600">미운행</span>
                      <span className="text-[11px] font-bold tabular-nums text-zinc-500">{noDriverDays}일</span>
                    </div>
                  </div>

                  {byYear[year].map((m, i) => {
                    const wh = m.avg_wh_km;
                    const whColor = effColor(wh);
                    const pct = maxDist > 0 ? Math.min(100, (m.total_distance_km / maxDist) * 100) : 0;
                    return (
                      <div
                        key={`${m.year}-${m.month}`}
                        className={`px-4 py-3 hover:bg-white/[0.03] transition-colors ${i < byYear[year].length - 1 ? 'border-b border-white/[0.06]' : ''}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-200 font-bold text-sm w-7 flex-shrink-0">{m.month}월</span>
                          <div className="flex-1 min-w-0">
                            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: '#3b82f6' }} />
                            </div>
                          </div>
                          <span className="text-white font-bold text-sm tabular-nums flex-shrink-0">{m.total_distance_km}<span className="text-zinc-600 text-xs ml-0.5">km</span></span>
                          <span className="text-zinc-600 text-xs tabular-nums flex-shrink-0"><span className="text-blue-400/70">{m.drive_count}</span>회</span>
                          <span className="text-zinc-600 text-xs tabular-nums flex-shrink-0"><span className="text-green-400/70">{m.total_energy_kwh}</span>kWh<span className="text-zinc-700 mx-0.5">·</span><span className="text-green-400/70">{m.charge_count}</span>회</span>
                          <span className="text-xs font-semibold tabular-nums w-12 text-right flex-shrink-0" style={{ color: whColor }}>
                            {wh != null ? `${wh.toFixed(0)}` : '—'}<span className="text-zinc-700 ml-0.5">Wh</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {seasonalEff && Object.keys(seasonalEff).length > 0 && (
            <div>
              <SectionLabel title="계절별 효율" />
              <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
                {(() => {
                  const SEASONS = [
                    { key: '봄', months: '3–5월' },
                    { key: '여름', months: '6–8월' },
                    { key: '가을', months: '9–11월' },
                    { key: '겨울', months: '12–2월' },
                  ];
                  const values = SEASONS.map(s => seasonalEff[s.key]).filter(v => v != null);
                  const minWh = values.length ? Math.min(...values) : 0;
                  const maxWh = values.length ? Math.max(...values) : 0;
                  const getColor = (wh) => {
                    if (wh == null) return 'text-zinc-700';
                    if (wh <= minWh + (maxWh - minWh) * 0.25) return 'text-emerald-400';
                    if (wh <= minWh + (maxWh - minWh) * 0.75) return 'text-amber-400';
                    return 'text-red-400';
                  };
                  return (
                    <div className="grid grid-cols-2">
                      {SEASONS.map((s, i) => {
                        const wh = seasonalEff[s.key];
                        const borderR = i % 2 === 0 ? 'border-r border-white/[0.06]' : '';
                        const borderB = i < 2 ? 'border-b border-white/[0.06]' : '';
                        return (
                          <div key={s.key} className={`text-center py-3 ${borderR} ${borderB}`}>
                            <div className="text-[10px] text-zinc-600 mb-1">{s.key} <span className="text-zinc-700">{s.months}</span></div>
                            {wh != null ? (
                              <>
                                <div className={`text-sm font-extrabold tabular-nums ${getColor(wh)}`}>{wh}</div>
                                <div className="text-[9px] text-zinc-600 mt-0.5">Wh/km</div>
                              </>
                            ) : (
                              <div className="text-sm font-bold text-zinc-700">—</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </main>
  );
}
