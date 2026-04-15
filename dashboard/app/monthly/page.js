'use client';

import { useState, useEffect, useMemo } from 'react';
import { useMock, MOCK_DATA } from '../context/mock';
import { formatDuration } from '../../lib/format';
import { Spinner, SectionLabel } from '@/app/components/PageLayout';

function StatBar({ val, max, color }) {
  const pct = max > 0 ? Math.min(100, (val / max) * 100) : 0;
  return (
    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function effColor(wh) {
  if (wh == null) return '#3f3f46';
  if (wh < 220) return '#10b981';
  if (wh < 260) return '#eab308';
  return '#f97316';
}

// ── 연간 히트맵 (GitHub 스타일, 초록=주행 / 파랑=충전) ──────

const _now = new Date(); // 모듈 로드 시 1회 계산, useMemo deps 안정화용

// 로그 스케일 기반 5단계 intensity (0~1 opacity)
function intensity(val, max) {
  if (!val || val <= 0 || !max) return 0;
  const ratio = Math.min(1, val / max);
  if (ratio <= 0.05) return 0.2;
  if (ratio <= 0.2)  return 0.4;
  if (ratio <= 0.5)  return 0.6;
  if (ratio <= 0.8)  return 0.8;
  return 1.0;
}

function YearHeatmap({ data, loading, onSelectMonth }) {
  // 오늘 기준 52주 전부터 이번 주까지 — 53열 × 7행
  const weeks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentSunday = new Date(today);
    currentSunday.setDate(today.getDate() - today.getDay());

    const weeksArr = [];
    for (let w = 52; w >= 0; w--) {
      const weekStart = new Date(currentSunday);
      weekStart.setDate(weekStart.getDate() - w * 7);
      const days = [];
      for (let d = 0; d < 7; d++) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + d);
        const future = day > today;
        days.push({ date: day, future });
      }
      weeksArr.push(days);
    }
    return weeksArr;
  }, []);

  const daysMap = data?.days || {};
  const maxKm = data?.max_km || 0;
  const maxKwh = data?.max_kwh || 0;

  const fmtDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  // 월 라벨: 각 주(column)의 일요일이 해당 월의 첫 7일 이내면 월명 표시
  const monthLabels = weeks.map((week) => {
    const first = week[0].date;
    return first.getDate() <= 7 ? first.getMonth() + 1 : null;
  });

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-zinc-400">지난 1년</span>
        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-blue-500" />주행
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-green-500" />충전
          </span>
        </div>
      </div>
      {loading ? (
        <div className="h-24 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto no-scrollbar">
          <div className="flex flex-col gap-[3px] min-w-fit">
            {/* 월 라벨 행 */}
            <div className="flex gap-[3px] pl-[18px] text-[9px] text-zinc-600 tabular-nums h-3">
              {monthLabels.map((m, i) => (
                <div key={i} className="w-[10px] text-left leading-none">
                  {m != null ? `${m}` : ''}
                </div>
              ))}
            </div>
            {/* DoW 라벨 + 주 컬럼 */}
            <div className="flex gap-[3px]">
              {/* 요일 라벨 (월/수/금만 표시) */}
              <div className="flex flex-col gap-[3px] text-[9px] text-zinc-600 pr-[3px] w-[15px]">
                {['', '월', '', '수', '', '금', ''].map((d, i) => (
                  <div key={i} className="h-[10px] leading-none">{d}</div>
                ))}
              </div>
              {/* 53주 그리드 */}
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map(({ date, future }, di) => {
                    if (future) {
                      return <div key={di} className="w-[10px] h-[10px]" />;
                    }
                    const key = fmtDate(date);
                    const d = daysMap[key] || { km: 0, kwh: 0 };
                    const driveOp = intensity(d.km, maxKm);
                    const chargeOp = intensity(d.kwh, maxKwh);
                    const hasData = driveOp > 0 || chargeOp > 0;
                    const title = `${date.getMonth()+1}/${date.getDate()} · ${d.km||0}km · ${d.kwh||0}kWh`;
                    return (
                      <button
                        key={di}
                        onClick={() => onSelectMonth?.(date.getFullYear(), date.getMonth())}
                        title={title}
                        className="w-[10px] h-[10px] rounded-[2px] relative overflow-hidden bg-zinc-800/60 hover:ring-1 hover:ring-white/40 transition-shadow"
                      >
                        {hasData && (
                          <>
                            <div className="absolute inset-x-0 top-0 h-1/2 bg-blue-500" style={{ opacity: driveOp }} />
                            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-green-500" style={{ opacity: chargeOp }} />
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 월별 달력 컴포넌트 ─────────────────────────────────────

function MonthlyCalendar({ drives, charges, calLoading, monthlyData, viewYear, setViewYear, viewMonth, setViewMonth }) {
  const [showPicker, setShowPicker] = useState(false);

  const isCurrentMonth = viewYear === _now.getFullYear() && viewMonth === _now.getMonth();
  const today = isCurrentMonth ? _now.getDate() : -1;

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

  // 월 선택 피커: 최근 12개월 (_now는 모듈 레벨 상수라 deps 불필요)
  const pickerMonths = useMemo(() => {
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(_now.getFullYear(), _now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    return months;
  }, []);

  // 일별 집계
  const daily = useMemo(() => {
    const map = {};
    for (let d = 1; d <= daysInMonth; d++) map[d] = { km: 0, kwh: 0, drives: 0, charges: 0 };
    (drives?.recent_drives || []).forEach(d => {
      const dt = new Date(d.start_date);
      if (dt.getFullYear() === viewYear && dt.getMonth() === viewMonth) {
        map[dt.getDate()].km += parseFloat(d.distance) || 0;
        map[dt.getDate()].drives++;
      }
    });
    (charges?.history || []).forEach(c => {
      const dt = new Date(c.start_date);
      if (dt.getFullYear() === viewYear && dt.getMonth() === viewMonth) {
        map[dt.getDate()].kwh += parseFloat(c.charge_energy_added) || 0;
        map[dt.getDate()].charges++;
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

  // monthly-history에서 현재 보고 있는 달의 상세 데이터 조회
  const curMonthData = (monthlyData || []).find(m => m.year === viewYear && m.month === viewMonth + 1);

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
          <span className="text-xs text-zinc-600">{showPicker ? '▲' : '▼'}</span>
        </button>
        <div className="flex-1 flex items-center justify-end gap-2 text-xs">
          <span className="text-blue-400 tabular-nums font-bold">{summary.totalKm.toFixed(1)}<span className="text-zinc-600 text-xs ml-0.5">km</span></span>
          <span className="text-green-400 tabular-nums font-bold">{summary.totalKwh.toFixed(1)}<span className="text-zinc-600 text-xs ml-0.5">kWh</span></span>
          {curMonthData?.avg_wh_km != null && (
            <span className="tabular-nums font-bold" style={{ color: effColor(curMonthData.avg_wh_km) }}>{curMonthData.avg_wh_km.toFixed(0)}<span className="text-zinc-600 text-xs ml-0.5">Wh</span></span>
          )}
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
              const label = year !== _now.getFullYear()
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
              const d = isCur ? (daily[day] || { km: 0, kwh: 0, drives: 0, charges: 0 }) : { km: 0, kwh: 0, drives: 0, charges: 0 };
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
                  {/* 날짜(좌) + 주행/충전 횟수(우) — 상단 */}
                  <span className={`absolute top-1 left-1.5 text-xs font-bold tabular-nums leading-none ${dayColor}`}>{day}</span>
                  {isCur && (d.drives > 0 || d.charges > 0) && (
                    <div className="absolute top-1 right-1 flex items-center gap-0.5">
                      {d.drives > 0 && (
                        <span className="text-xs font-bold text-blue-400/80 tabular-nums leading-none">{d.drives}</span>
                      )}
                      {d.charges > 0 && (
                        <span className="text-xs font-bold text-green-400/80 tabular-nums leading-none">{d.charges}</span>
                      )}
                    </div>
                  )}
                  {/* km 숫자 — 우하단 */}
                  {hasKm && (
                    <span className="absolute bottom-1 right-1.5 text-xs font-black text-blue-400 tabular-nums leading-none">
                      {d.km.toFixed(0)}<span className="text-[11px] font-medium text-blue-400/50 ml-0.5">km</span>
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

  // 연간 히트맵용 365일 집계
  const [yearHeatmap, setYearHeatmap] = useState(null);
  const [heatmapLoading, setHeatmapLoading] = useState(true);

  // 월 뷰 선택 (히트맵과 달력이 공유)
  const [viewYear, setViewYear] = useState(_now.getFullYear());
  const [viewMonth, setViewMonth] = useState(_now.getMonth());

  useEffect(() => {
    if (isMock) {
      setData(MOCK_DATA.monthlyHistory);
      setDrives(MOCK_DATA.drives);
      setCharges(MOCK_DATA.charges);
      setYearHeatmap(MOCK_DATA.yearHeatmap || null);
      setLoading(false);
      setCalLoading(false);
      setHeatmapLoading(false);
      return;
    }

    setLoading(true);
    setCalLoading(true);
    setHeatmapLoading(true);
    setError(null);

    fetch('/api/year-heatmap')
      .then(r => r.json())
      .then(d => { setYearHeatmap(d); setHeatmapLoading(false); })
      .catch(() => { setYearHeatmap(null); setHeatmapLoading(false); });

    // 연도별 히스토리
    fetch('/api/monthly-history')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError('월별 데이터를 불러오지 못했습니다.'); setLoading(false); });

    // 달력용 상세 데이터
    Promise.all([
      fetch('/api/drives').then(r => r.json()).catch(() => null),
      fetch('/api/charges').then(r => r.json()).catch(() => null),
    ]).then(([drivesData, chargesData]) => {
      setDrives(drivesData);
      setCharges(chargesData);
      setCalLoading(false);
    });
  }, [isMock, refreshSignal]);

  const months = data?.months || [];
  const driveDaysByYear = data?.driveDaysByYear || {};
  const seasonalEff = data?.seasonalEff || {};
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;

  // 오늘이 포함된 달은 달력에서 표시하므로 하단 리스트에서 제외
  const listMonths = months.filter(m => !(m.year === curYear && m.month === curMonth));

  const byYear = {};
  for (const m of listMonths) {
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

  const maxDist = listMonths.length > 0 ? Math.max(...listMonths.map(m => m.total_distance_km)) : 1;

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 py-5 pb-20">

        {/* 연간 히트맵 (GitHub 스타일) */}
        <div className="mb-3">
          <YearHeatmap
            data={yearHeatmap}
            loading={heatmapLoading}
            onSelectMonth={(y, m) => { setViewYear(y); setViewMonth(m); }}
          />
        </div>

        {/* 달력 */}
        <div className="mb-6">
          <MonthlyCalendar
            drives={drives}
            charges={charges}
            calLoading={calLoading}
            monthlyData={months}
            viewYear={viewYear}
            setViewYear={setViewYear}
            viewMonth={viewMonth}
            setViewMonth={setViewMonth}
          />
        </div>

        {/* 연도별 월간 통계 */}
        {error ? (
          <p className="text-red-400 text-sm text-center py-8">{error}</p>
        ) : !loading && !data ? (
          <p className="text-zinc-500 text-sm text-center py-8">데이터가 없습니다</p>
        ) : null}
        {loading ? <Spinner /> : !error && months.length === 0 ? (
          <p className="text-center text-zinc-600 py-16">데이터가 없습니다</p>
        ) : !error && (
          <>
          <div className="space-y-5">
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
                  {/* 연도 헤더 + 합계 한 줄 */}
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

                  {/* 월별 목록 */}
                  {byYear[year].map((m, i) => {
                    const wh = m.avg_wh_km;
                    const whColor = effColor(wh);
                    return (
                      <div
                        key={`${m.year}-${m.month}`}
                        className={`px-4 py-3 hover:bg-white/[0.03] transition-colors ${i < byYear[year].length - 1 ? 'border-b border-white/[0.06]' : ''}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-200 font-bold text-sm w-7 flex-shrink-0">{m.month}월</span>
                          <div className="flex-1 min-w-0">
                            <StatBar val={m.total_distance_km} max={maxDist} color="#3b82f6" />
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

          {/* 계절별 효율 */}
          {seasonalEff && Object.keys(seasonalEff).length > 0 && (
            <div>
              <SectionLabel title="계절별 효율" />
              <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
                {(() => {
                  const SEASONS = [
                    { key: '봄', months: '3–5월', emoji: '🌸' },
                    { key: '여름', months: '6–8월', emoji: '☀️' },
                    { key: '가을', months: '9–11월', emoji: '🍂' },
                    { key: '겨울', months: '12–2월', emoji: '❄️' },
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
