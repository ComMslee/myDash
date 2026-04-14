'use client';

import { useState, useEffect, useMemo } from 'react';
import { useMock, MOCK_DATA } from '../context/mock';
import { formatDuration } from '../../lib/format';

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-7 h-7 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
    </div>
  );
}

function StatBar({ val, max, color }) {
  const pct = max > 0 ? Math.min(100, (val / max) * 100) : 0;
  return (
    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function YearSummaryCard({ t }) {
  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-3 mb-3">
      <div className="grid grid-cols-4 gap-3">
        <div className="text-center">
          <p className="text-white font-bold text-lg tabular-nums">{t.total_distance_km}</p>
          <p className="text-zinc-600 text-xs">km</p>
        </div>
        <div className="text-center">
          <p className="text-blue-400 font-bold text-lg tabular-nums">{t.drive_count}</p>
          <p className="text-zinc-600 text-xs">주행</p>
        </div>
        <div className="text-center">
          <p className="text-green-400 font-bold text-lg tabular-nums">{t.total_energy_kwh}</p>
          <p className="text-zinc-600 text-xs">kWh</p>
        </div>
        <div className="text-center">
          <p className="text-amber-400 font-bold text-lg tabular-nums">{t.charge_count}</p>
          <p className="text-zinc-600 text-xs">충전</p>
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-white/5 text-center">
        <span className="text-zinc-500 text-[11px]">월평균 <span className="text-zinc-300 font-medium">{t.avg_monthly_km}</span> km</span>
      </div>
    </div>
  );
}

// ── 월별 달력 컴포넌트 ─────────────────────────────────────

function MonthlyCalendar({ drives, charges, calLoading }) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-11
  const [showPicker, setShowPicker] = useState(false);

  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();
  const today = isCurrentMonth ? now.getDate() : -1;

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

  const goBack = () => {
    setShowPicker(false);
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const goForward = () => {
    setShowPicker(false);
    if (isCurrentMonth) return;
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  // 월 선택 피커: 최근 12개월
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pickerMonths = useMemo(() => {
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    return months;
  }, []);

  // 일별 집계
  const daily = useMemo(() => {
    const map = {};
    for (let d = 1; d <= daysInMonth; d++) map[d] = { km: 0, kwh: 0 };
    (drives?.recent_drives || []).forEach(d => {
      const dt = new Date(d.start_date);
      if (dt.getFullYear() === viewYear && dt.getMonth() === viewMonth) {
        map[dt.getDate()].km += parseFloat(d.distance) || 0;
      }
    });
    (charges?.history || []).forEach(c => {
      const dt = new Date(c.start_date);
      if (dt.getFullYear() === viewYear && dt.getMonth() === viewMonth) {
        map[dt.getDate()].kwh += parseFloat(c.charge_energy_added) || 0;
      }
    });
    return map;
  }, [drives, charges, viewYear, viewMonth, daysInMonth]);

  // 월 요약 집계
  const summary = useMemo(() => {
    let totalKm = 0, driveCount = 0, totalKwh = 0, chargeCount = 0, activeDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const day = daily[d];
      if (!day) continue;
      if (day.km > 0) { totalKm += day.km; driveCount++; }
      if (day.kwh > 0) { totalKwh += day.kwh; chargeCount++; }
      if (day.km > 0 || day.kwh > 0) activeDays++;
    }
    return { totalKm, driveCount, totalKwh, chargeCount, activeDays };
  }, [daily, daysInMonth]);


  // 셀 구성
  const cells = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push({ day: prevMonthDays - firstDay + 1 + i, type: 'prev' });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, type: 'cur' });
  }
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ day: nextDay++, type: 'next' });
  }

  const monthLabel = `${String(viewYear).slice(2)}/${String(viewMonth + 1).padStart(2, '0')}`;
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      {/* 헤더 + 월 요약 통합 */}
      <div className="px-3 py-2 border-b border-white/[0.06] flex items-center gap-1.5">
        <button
          onClick={goBack}
          aria-label="이전 달"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={() => setShowPicker(p => !p)}
          className="text-sm font-bold text-zinc-200 hover:text-white transition-colors flex items-center gap-1"
        >
          {monthLabel}
          <span className="text-[10px] text-zinc-600">{showPicker ? '▲' : '▼'}</span>
        </button>
        <div className="flex-1 flex items-center justify-end gap-3 text-xs">
          <span className="text-blue-400 tabular-nums font-bold">{summary.totalKm.toFixed(1)}<span className="text-zinc-600 text-[10px] ml-0.5">km</span></span>
          <span className="text-green-400 tabular-nums font-bold">{summary.totalKwh.toFixed(1)}<span className="text-zinc-600 text-[10px] ml-0.5">kWh</span></span>
          <span className="text-zinc-300 tabular-nums font-bold">{summary.activeDays}<span className="text-zinc-600 text-[10px] ml-0.5">일</span></span>
        </div>
        <button
          onClick={goForward}
          disabled={isCurrentMonth}
          aria-label="다음 달"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-20"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* 월 선택 피커 */}
      {showPicker && (
        <div className="border-b border-white/[0.06] bg-[#111] px-3 py-2">
          <div className="grid grid-cols-4 gap-1">
            {pickerMonths.map(({ year, month }) => {
              const isSelected = year === viewYear && month === viewMonth;
              const label = year !== now.getFullYear()
                ? `${String(year).slice(2)}·${month + 1}월`
                : `${month + 1}월`;
              return (
                <button
                  key={`${year}-${month}`}
                  onClick={() => { setViewYear(year); setViewMonth(month); setShowPicker(false); }}
                  className={`py-1.5 text-xs rounded-lg transition-colors ${isSelected ? 'bg-blue-600 text-white font-bold' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}


      {/* 달력 그리드 */}
      {calLoading ? (
        <div className="py-8 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="p-3">
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {weekdays.map((w, i) => (
              <div
                key={w}
                className={`text-center text-xs font-bold py-0.5 ${i === 0 ? 'text-red-400/70' : i === 6 ? 'text-blue-400/70' : 'text-zinc-500'}`}
              >
                {w}
              </div>
            ))}
          </div>
          {/* 날짜 셀 */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, idx) => {
              const { day, type } = cell;
              const isCur = type === 'cur';
              const d = isCur ? (daily[day] || { km: 0, kwh: 0 }) : { km: 0, kwh: 0 };
              const isToday = isCur && day === today;
              const dow = idx % 7;
              const hasKm = isCur && d.km > 0;
              const hasKwh = isCur && d.kwh > 0;
              const bgClass = !isCur ? 'bg-transparent' : isToday ? 'bg-amber-500/[0.07]' : 'bg-zinc-800/[0.12]';

              const dayColor = !isCur
                ? 'text-zinc-700'
                : isToday
                  ? 'text-amber-300'
                  : dow === 0
                    ? 'text-red-400/70'
                    : dow === 6
                      ? 'text-blue-400/70'
                      : 'text-zinc-300';

              return (
                <div
                  key={idx}
                  className={`relative aspect-square rounded-lg overflow-hidden flex flex-col ${bgClass} ${isToday ? 'ring-1 ring-amber-400/80 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.3)]' : ''}`}
                >
                  {/* 충전 표시 — 우상단 녹색 점 */}
                  {hasKwh && (
                    <span className="absolute top-1 right-1 w-[5px] h-[5px] rounded-full bg-green-400" aria-hidden="true" />
                  )}
                  {/* 날짜 숫자 — 좌상단 */}
                  <span className={`absolute top-1 left-1.5 text-xs font-bold tabular-nums leading-none ${dayColor}`}>
                    {day}
                  </span>
                  {/* km 숫자 — 우하단 */}
                  {hasKm && (
                    <span className="absolute bottom-1 right-1.5 text-xs font-black text-blue-400 tabular-nums leading-none">
                      {d.km.toFixed(0)}<span className="text-[9px] font-medium text-blue-400/50 ml-0.5">km</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 메인 페이지 ────────────────────────────────────────────

export default function MonthlyPage() {
  const { isMock, refreshSignal } = useMock();

  // 연도별 데이터
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 달력용 drives/charges
  const [drives, setDrives] = useState(null);
  const [charges, setCharges] = useState(null);
  const [calLoading, setCalLoading] = useState(true);
  const [insights, setInsights] = useState(null);

  useEffect(() => {
    if (isMock) {
      setData(MOCK_DATA.monthlyHistory);
      setDrives(MOCK_DATA.drives);
      setCharges(MOCK_DATA.charges);
      setInsights(MOCK_DATA.insights);
      setLoading(false);
      setCalLoading(false);
      return;
    }

    setLoading(true);
    setCalLoading(true);
    setError(null);

    // 연도별 히스토리
    fetch('/api/monthly-history')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError('월별 데이터를 불러오지 못했습니다.'); setLoading(false); });

    // 달력용 상세 데이터 + 인사이트
    Promise.all([
      fetch('/api/drives').then(r => r.json()).catch(() => null),
      fetch('/api/charges').then(r => r.json()).catch(() => null),
      fetch('/api/insights').then(r => r.json()).catch(() => null),
    ]).then(([drivesData, chargesData, insightsData]) => {
      setDrives(drivesData);
      setCharges(chargesData);
      setInsights(insightsData);
      setCalLoading(false);
    });
  }, [isMock, refreshSignal]);

  const months = data?.months || [];

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
    yearTotals[y] = {
      drive_count: ms.reduce((s, m) => s + Number(m.drive_count || 0), 0),
      total_distance_km: totalKm,
      total_duration_min: ms.reduce((s, m) => s + Number(m.total_duration_min || 0), 0),
      charge_count: ms.reduce((s, m) => s + Number(m.charge_count || 0), 0),
      total_energy_kwh: parseFloat(ms.reduce((s, m) => s + Number(m.total_energy_kwh || 0), 0).toFixed(1)),
      avg_monthly_km: monthCount > 0 ? Math.round(totalKm / monthCount) : 0,
    };
  }

  const maxDist = months.length > 0 ? Math.max(...months.map(m => m.total_distance_km)) : 1;

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 py-5 pb-20">

        {/* 달력 */}
        <div className="mb-5">
          <MonthlyCalendar
            drives={drives}
            charges={charges}
            calLoading={calLoading}
          />
        </div>

        {/* 최근 6개월 추이 (주행거리 + 충전량 통합) */}
        {insights?.monthlyBreakdown?.length > 0 && (() => {
          const bd = insights.monthlyBreakdown;
          const maxDist6 = Math.max(1, ...bd.map(m => m.distance));
          const maxKwh6 = Math.max(1, ...bd.map(m => m.total_kwh));
          const BAR_H = 100;
          return (
            <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 pt-3 pb-3 mb-5">
              <div className="flex items-center gap-4 mb-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-1.5 rounded-sm bg-blue-500" />
                  <span className="text-[10px] text-zinc-500">주행거리</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-1.5 rounded-sm bg-green-500" />
                  <span className="text-[10px] text-zinc-500">충전량</span>
                </div>
              </div>
              <div className="flex items-end gap-1.5" style={{ height: BAR_H + 40 }}>
                {bd.map(m => {
                  const distPct = maxDist6 > 0 ? (m.distance / maxDist6) * 100 : 0;
                  const kwhPct = maxKwh6 > 0 ? (m.total_kwh / maxKwh6) * 100 : 0;
                  return (
                    <div key={m.month} className="flex-1 flex flex-col items-center justify-end gap-0.5">
                      <div className="flex items-end gap-0.5 w-full justify-center" style={{ height: BAR_H }}>
                        <div className="flex-1 flex flex-col items-center justify-end h-full">
                          {m.distance > 0 && (
                            <span className="text-[8px] text-blue-400/80 tabular-nums leading-none mb-0.5">{m.distance}</span>
                          )}
                          <div className="w-full bg-zinc-800/40 rounded-sm overflow-hidden relative" style={{ height: BAR_H }}>
                            <div
                              className="absolute bottom-0 inset-x-0 bg-blue-500/70 rounded-sm transition-all duration-500"
                              style={{ height: `${distPct}%` }}
                            />
                          </div>
                        </div>
                        <div className="flex-1 flex flex-col items-center justify-end h-full">
                          {m.total_kwh > 0 && (
                            <span className="text-[8px] text-green-400/80 tabular-nums leading-none mb-0.5">{m.total_kwh}</span>
                          )}
                          <div className="w-full bg-zinc-800/40 rounded-sm overflow-hidden relative" style={{ height: BAR_H }}>
                            <div
                              className="absolute bottom-0 inset-x-0 bg-green-500/70 rounded-sm transition-all duration-500"
                              style={{ height: `${kwhPct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] text-zinc-600 mt-1">{m.month}월</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* 기존 연도별 통계 */}
        {error ? (
          <p className="text-red-400 text-sm text-center py-8">{error}</p>
        ) : !loading && !data ? (
          <p className="text-zinc-500 text-sm text-center py-8">데이터가 없습니다</p>
        ) : null}
        {loading ? <Spinner /> : !error && months.length === 0 ? (
          <p className="text-center text-zinc-600 py-16">데이터가 없습니다</p>
        ) : !error && (
          <div className="space-y-6">
            {years.map(year => {
              const t = yearTotals[year];
              return (
                <div key={year}>
                  {/* 연도 헤더 */}
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-sm font-bold text-zinc-500">{year}</span>
                    <div className="flex-1 h-px bg-white/5" />
                  </div>

                  {/* 연간 합계 카드 */}
                  <YearSummaryCard t={t} />

                  {/* 월별 목록 */}
                  <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
                    {byYear[year].map((m, i) => (
                      <div
                        key={`${m.year}-${m.month}`}
                        className={`px-4 py-4 cursor-pointer hover:bg-white/5 transition-colors rounded ${i < byYear[year].length - 1 ? 'border-b border-white/[0.06]' : ''}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`${m.month_label || `${String(m.year).slice(2)}/${String(m.month).padStart(2, '0')}`} 상세 보기`}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-zinc-200 font-bold text-base w-8">{m.month}월</span>
                          <div className="flex-1">
                            <StatBar val={m.total_distance_km} max={maxDist} color="#3b82f6" />
                          </div>
                          <span className="text-white font-bold text-base tabular-nums w-20 text-right">{m.total_distance_km} km</span>
                        </div>
                        <div className="flex items-center gap-4 pl-11 text-xs">
                          <span className="text-zinc-500"><span className="text-blue-400/70 font-medium">{m.drive_count}</span> 주행</span>
                          <span className="text-zinc-500">{formatDuration(m.total_duration_min)}</span>
                          <span className="text-zinc-500"><span className="text-green-400/70 font-medium">{m.total_energy_kwh}</span> kWh</span>
                          <span className="text-zinc-500"><span className="text-amber-400/70 font-medium">{m.charge_count}</span> 충전</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
