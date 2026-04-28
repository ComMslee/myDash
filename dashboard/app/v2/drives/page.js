'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMock, MOCK_DATA } from '@/app/context/mock';
import { formatDuration } from '@/lib/format';
import { effColor } from '@/lib/effColor';
import { Spinner } from '@/app/components/PageLayout';
import { HourDowHeatmap } from '@/app/components/ChartWidgets';
import YearHeatmap from '@/app/components/YearHeatmap';
import { useRankingsSheet } from '../components/RankingsSheet';

// ── NEW 배지 ──────────────────────────────────────────────────
function NewBadge() {
  return (
    <span className="text-[8px] font-bold px-1 py-px rounded bg-gradient-to-br from-blue-500 to-violet-500 text-white leading-none">NEW</span>
  );
}

// ── 차량 KPI 헤더 ─────────────────────────────────────────────
function VehicleKpiCard({ car, insights }) {
  const odometer = car?.odometer;
  const recentEff = insights?.sixMonth?.efficiency_wh_km ?? null;
  const allTimeEff = insights?.allTime?.efficiency_wh_km ?? null;

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-3 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-zinc-500 font-semibold tracking-widest uppercase mb-0.5">누적 주행거리</p>
        {odometer != null ? (
          <p className="text-xl font-black tabular-nums text-white">
            {Number(odometer).toLocaleString()}
            <span className="text-xs text-zinc-600 ml-1 font-normal">km</span>
          </p>
        ) : (
          <p className="text-xl font-black text-zinc-700">—</p>
        )}
      </div>
      {(recentEff != null || allTimeEff != null) && (
        <div className="text-right shrink-0">
          <p className="text-[10px] text-zinc-600 mb-0.5">최근 6개월 효율</p>
          <p className="text-sm font-bold tabular-nums" style={{ color: recentEff ? effColor(recentEff) : '#52525b' }}>
            {recentEff ? `${recentEff.toFixed(0)} Wh/km` : '—'}
          </p>
          {allTimeEff != null && (
            <p className="text-[10px] text-zinc-600">전기간 {allTimeEff.toFixed(0)}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── 기간별 통계 (이번달 추가) ─────────────────────────────────
function PeriodStats({ drives, monthlyHistory }) {
  const months = monthlyHistory?.months || [];
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  const thisMon = months.find(m => m.year === curY && m.month === curM);

  const stats = [
    { label: '오늘',     km: drives?.today_distance ?? 0,      kwh: drives?.today_energy_kwh ?? 0, highlight: false },
    { label: '이번주',   km: drives?.week_distance ?? 0,       kwh: drives?.week_energy_kwh ?? 0,  highlight: false },
    { label: '저번주',   km: drives?.prev_week_distance ?? 0,  kwh: drives?.prev_week_energy_kwh ?? 0, highlight: false },
    {
      label: '이번달',
      km: thisMon ? Number(thisMon.total_distance_km) : 0,
      kwh: thisMon ? Number(thisMon.total_energy_kwh) : 0,
      highlight: true,
    },
  ];

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      {stats.map((s, i) => {
        const eff = s.km > 0 && s.kwh > 0 ? (s.kwh / s.km * 1000).toFixed(0) : null;
        const isEmpty = s.km === 0 && s.kwh === 0;
        return (
          <div
            key={s.label}
            className={`grid grid-cols-4 px-4 py-3 items-center ${i < stats.length - 1 ? 'border-b border-white/[0.04]' : ''} ${s.highlight ? 'bg-blue-500/[0.04]' : ''}`}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-zinc-400">{s.label}</span>
              {s.highlight && <NewBadge />}
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

// ── 이번달 인사이트 — 베스트 주행 highlight ────────────────────
function MonthInsightsCard({ insights }) {
  const router = useRouter();
  const longBest = insights?.current?.best_drive_long;
  const effBest = insights?.current?.best_drive_eff;
  if (!longBest && !effBest) return null;

  const fmtMD = (iso) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const Row = ({ iconSvg, iconColor, label, valueNode, dateStr, driveId }) => (
    <button
      onClick={() => router.push(`/v2/history?id=${driveId}`)}
      className="w-full flex items-center gap-2 px-3 py-3 hover:bg-white/[0.03] active:bg-blue-500/10 transition-colors text-left border-b border-white/[0.04] last:border-0"
    >
      <span className={`flex-shrink-0 ${iconColor}`}>{iconSvg}</span>
      <span className="text-xs text-zinc-400 font-semibold flex-shrink-0 whitespace-nowrap">{label}</span>
      <span className="flex-1 min-w-0 text-right tabular-nums whitespace-nowrap">{valueNode}</span>
      <span className="text-[11px] text-zinc-500 tabular-nums flex-shrink-0 text-right whitespace-nowrap">{dateStr}</span>
      <svg className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-3 py-2 border-b border-white/[0.06] flex items-center gap-2">
        <span className="text-[11px] font-bold tracking-widest uppercase text-zinc-500">이번달 인사이트</span>
        <NewBadge />
      </div>
      {longBest && (
        <Row
          iconSvg={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          }
          iconColor="text-blue-400"
          label="최장 주행"
          valueNode={<><span className="font-bold text-blue-400 text-base">{longBest.distance}</span><span className="text-xs text-zinc-600 ml-0.5">km</span></>}
          dateStr={fmtMD(longBest.start_date)}
          driveId={longBest.id}
        />
      )}
      {effBest && (
        <Row
          iconSvg={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
          iconColor="text-emerald-400"
          label="최고 효율"
          valueNode={<><span className="font-bold text-base" style={{ color: effColor(effBest.eff_wh_km) }}>{effBest.eff_wh_km}</span><span className="text-xs text-zinc-600 ml-0.5">Wh/km</span></>}
          dateStr={fmtMD(effBest.start_date)}
          driveId={effBest.id}
        />
      )}
    </div>
  );
}

// ── TOP 50 기록 카드 (시트 오픈) ─────────────────────────────
function RecordsCardV2({ allTime }) {
  const { open } = useRankingsSheet();

  if (!allTime) return null;

  const km  = (v) => <>{v}<span className="text-zinc-600 text-[11px] ml-0.5 font-normal">km</span></>;
  const kmh = (v) => <>{v}<span className="text-zinc-600 text-[11px] ml-0.5 font-normal">km/h</span></>;
  const wh  = (v) => <>{v}<span className="text-zinc-600 text-[11px] ml-0.5 font-normal">Wh/km</span></>;

  const rows = [
    {
      label: '거리',
      color: 'text-blue-400',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      ),
      drive: { value: km(allTime.max_distance),     metric: 'distance', base: 'drive' },
      day:   { value: km(allTime.max_day_distance), metric: 'distance', base: 'day'   },
    },
    {
      label: '시간',
      color: 'text-zinc-200',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      drive: { value: formatDuration(allTime.max_duration),     metric: 'duration', base: 'drive' },
      day:   { value: formatDuration(allTime.max_day_duration), metric: 'duration', base: 'day'   },
    },
    {
      label: '속도',
      color: 'text-amber-400',
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      drive: { value: kmh(allTime.avg_speed), metric: 'avg_speed', base: 'drive' },
      day:   { value: allTime.max_day_avg_speed != null ? kmh(allTime.max_day_avg_speed) : '—', metric: 'avg_speed', base: 'day' },
    },
    {
      label: '효율',
      color: 'text-emerald-400',
      isNew: true,
      icon: (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      drive: { value: allTime.min_eff_wh_km != null ? wh(allTime.min_eff_wh_km) : '—', metric: 'eff', base: 'drive' },
      day:   { value: allTime.min_day_eff_wh_km != null ? wh(allTime.min_day_eff_wh_km) : '—', metric: 'eff', base: 'day'   },
    },
  ];

  const cellBase = 'py-3 text-center font-bold text-lg leading-none tabular-nums transition-colors rounded-lg cursor-pointer';

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-4 pt-3 pb-3">
        <div className="grid grid-cols-[40px_1fr_1fr] gap-1 pb-1">
          <div className="text-[9px] font-bold tracking-wider text-zinc-600 flex items-center justify-center">TOP 50</div>
          <div className="text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500">단일 주행</div>
          <div className="text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500">일 합계</div>
        </div>
        <div className="grid grid-cols-[40px_1fr_1fr] gap-1">
          {rows.flatMap((r, i) => [
            <div key={`l-${i}`} className={`flex flex-col items-center justify-center gap-0.5 ${r.color}`}>
              {r.icon}
              {r.isNew && <NewBadge />}
            </div>,
            <button
              key={`d-${i}`}
              onClick={() => open(r.drive.metric, r.drive.base)}
              className={`${cellBase} ${r.color} hover:bg-white/[0.04] active:bg-blue-500/10`}
            >
              {r.drive.value}
            </button>,
            <button
              key={`y-${i}`}
              onClick={() => open(r.day.metric, r.day.base)}
              className={`${cellBase} ${r.color} hover:bg-white/[0.04] active:bg-blue-500/10`}
            >
              {r.day.value}
            </button>,
          ])}
        </div>
      </div>
    </div>
  );
}

// ── 메인 페이지 ────────────────────────────────────────────────
export default function V2DrivesPage() {
  const { isMock, refreshSignal } = useMock();

  const [drives, setDrives] = useState(null);
  const [insights, setInsights] = useState(null);
  const [yearHeatmap, setYearHeatmap] = useState(null);
  const [monthlyHistory, setMonthlyHistory] = useState(null);
  const [car, setCar] = useState(null);
  const [loading, setLoading] = useState({ drives: true, insights: true, heatmap: true, history: true, car: true });

  useEffect(() => {
    if (isMock) {
      setDrives(MOCK_DATA.drives);
      setInsights({ ...MOCK_DATA.insights, allTime: { ...MOCK_DATA.insights.sixMonth, avg_speed: 42.3, max_day_distance: 248.7, max_day_duration: 320 } });
      setYearHeatmap(MOCK_DATA.yearHeatmap || null);
      setMonthlyHistory(MOCK_DATA.monthlyHistory || null);
      setCar(null);
      setLoading({ drives: false, insights: false, heatmap: false, history: false, car: false });
      return;
    }

    fetch('/api/drives').then(r => r.json())
      .then(d => { setDrives(d); setLoading(p => ({ ...p, drives: false })); })
      .catch(() => setLoading(p => ({ ...p, drives: false })));

    fetch('/api/insights').then(r => r.json())
      .then(d => { setInsights(d); setLoading(p => ({ ...p, insights: false })); })
      .catch(() => setLoading(p => ({ ...p, insights: false })));

    fetch('/api/year-heatmap').then(r => r.json())
      .then(d => { setYearHeatmap(d); setLoading(p => ({ ...p, heatmap: false })); })
      .catch(() => setLoading(p => ({ ...p, heatmap: false })));

    fetch('/api/monthly-history').then(r => r.json())
      .then(d => { setMonthlyHistory(d); setLoading(p => ({ ...p, history: false })); })
      .catch(() => setLoading(p => ({ ...p, history: false })));

    fetch('/api/car').then(r => r.json())
      .then(d => { setCar(d); setLoading(p => ({ ...p, car: false })); })
      .catch(() => setLoading(p => ({ ...p, car: false })));
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

  const isLoading = Object.values(loading).some(Boolean);

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 py-5 pb-24 space-y-5">

        {/* 1. 차량 KPI 헤더 */}
        {!loading.car && !loading.insights && (
          <VehicleKpiCard car={car} insights={insights} />
        )}

        {/* 2. 기간별 통계 (이번달 포함) */}
        {loading.drives || loading.history ? <Spinner /> : (
          <PeriodStats drives={drives} monthlyHistory={monthlyHistory} />
        )}

        {/* 3. 이번달 인사이트 */}
        {!loading.insights && <MonthInsightsCard insights={insights} />}

        {/* 4. 연간 히트맵 */}
        <YearHeatmap
          data={yearHeatmap}
          loading={loading.heatmap}
          title=""
          metric="km"
          color="#3b82f6"
          legendLabel="주행"
          latestLeft
        />

        {/* 5. 주행 패턴 — 시간×요일 히트맵 */}
        {insights?.hour_dow && (
          <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="px-3 py-2 border-b border-white/[0.06]">
              <span className="text-[11px] font-bold tracking-widest uppercase text-zinc-500">주행 패턴</span>
            </div>
            <div className="px-4 pt-4 pb-4">
              <HourDowHeatmap data={insights.hour_dow} hexColor="#3b82f6" />
            </div>
          </div>
        )}

        {/* 6. TOP 50 기록 (랭킹 시트) */}
        {!loading.insights && <RecordsCardV2 allTime={insights?.allTime} />}

        {/* 7. 연도별 월간 통계 + 계절별 효율 */}
        {loading.history ? <Spinner /> : months.length === 0 ? (
          <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-6 text-center text-zinc-600 text-xs">
            데이터가 없습니다
          </div>
        ) : (
          <>
            <div className="space-y-4">
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
              <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
                <div className="px-3 py-2 border-b border-white/[0.06]">
                  <span className="text-[11px] font-bold tracking-widest uppercase text-zinc-500">계절별 효율</span>
                </div>
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
            )}
          </>
        )}
      </div>
    </main>
  );
}
