'use client';

import { useEffect, useState } from 'react';
import { Icon } from '../../../lib/Icons';

// 단지 충전 인프라 활용도 라이브 패널.
// /v2/chargers 페이지 하단 인라인 + /v2/chargers/report 별도 페이지 캡처용 공유.
export default function ReportPanel() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    // ?debug=1 로 진입한 경우에만 raw 응답 덤프 노출 — 외부 캡처용 패널에 노이즈 차단
    if (typeof window !== 'undefined') {
      setShowDebug(new URLSearchParams(window.location.search).has('debug'));
    }
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch('/api/home-charger/report', { cache: 'no-store' });
        const j = await r.json();
        if (!alive) return;
        if (j.error) {
          setErr({ error: j.error, detail: j.detail, where: j.where, code: j.code });
        } else {
          setD(j);
          setErr(null);
        }
      } catch (e) {
        if (alive) setErr({ error: 'fetch', detail: e.message || '로딩 실패' });
      }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (err) return (
    <Wrap>
      <div className="p-4 text-sm">
        <div className="text-rose-400 font-bold inline-flex items-center gap-1.5"><Icon name="warn" className="w-5 h-5" />{err.error}</div>
        {err.detail && (
          <div className="text-rose-300 text-xs mt-1 break-all">{err.detail}</div>
        )}
        {(err.where || err.code) && (
          <div className="text-rose-300/70 text-[10px] mt-1 break-all">
            {err.code && <span>code={err.code} </span>}
            {err.where && <span>where={err.where}</span>}
          </div>
        )}
      </div>
    </Wrap>
  );
  if (!d)  return <Wrap><div className="p-4 text-zinc-500 text-sm">로딩 중…</div></Wrap>;
  if (!d.kpi) return <Wrap><div className="p-4 text-zinc-500 text-sm">데이터 누적 시작 전입니다.</div></Wrap>;

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <Header meta={d.meta} />
      <div className="p-3 space-y-3">
        <KpiGrid kpi={d.kpi} />
        <WeeklyLine weekly={d.weekly} />
        <DongBars byDong={d.by_dong} />
        <Footer />
        {showDebug && <DebugDump data={d} />}
      </div>
    </div>
  );
}

// 디버그 — 데이터 검증용. 응답 raw 와 핵심 카운트.
function DebugDump({ data }) {
  return (
    <details className="text-[10px] text-zinc-600 mt-1">
      <summary className="cursor-pointer select-none hover:text-zinc-400 inline-flex items-center gap-1"><Icon name="search" className="w-4 h-4" />디버그 (raw 응답)</summary>
      <div className="mt-1.5 space-y-1.5 bg-black/30 rounded p-2 border border-white/[0.04]">
        <div>
          <span className="text-zinc-500">meta:</span>{' '}
          <span className="text-zinc-300">
            chargers={data.meta.total_chargers} (관측 {data.meta.observed_chargers}) ·
            관측일수={data.meta.days_observed}
          </span>
        </div>
        <div>
          <span className="text-zinc-500">kpi:</span>{' '}
          <span className="text-zinc-300 break-all">
            overall={data.kpi.overall_pct}% ·
            day(평/피)={data.kpi.daily_avg_pct}/{data.kpi.daily_peak_pct} ·
            week={data.kpi.weekly_avg_pct}/{data.kpi.weekly_peak_pct} ·
            month={data.kpi.monthly_avg_pct}/{data.kpi.monthly_peak_pct} ·
            trend={data.kpi.trend_6m_delta_pp}%p
          </span>
        </div>
        <div>
          <span className="text-zinc-500">weekly[{data.weekly?.length || 0}]:</span>{' '}
          {data.weekly?.length ? (
            <span className="text-zinc-300">
              {data.weekly[0].label}~{data.weekly[data.weekly.length - 1].label} ·
              평균 {(data.weekly.reduce((s, w) => s + w.occupancy_pct, 0) / data.weekly.length).toFixed(1)}%
            </span>
          ) : <span className="text-zinc-500">empty</span>}
        </div>
        <div>
          <span className="text-zinc-500">by_dong[{data.by_dong?.length || 0}]:</span>{' '}
          <span className="text-zinc-300 break-all">
            {(data.by_dong || []).map(d => `${d.title}=${d.occupancy_pct}%(${d.total}기)`).join(' · ')}
          </span>
        </div>
        <details className="mt-1">
          <summary className="cursor-pointer text-zinc-500 hover:text-zinc-400">전체 JSON</summary>
          <pre className="mt-1 text-[9px] text-zinc-400 overflow-auto max-h-64 leading-relaxed">
{JSON.stringify(data, null, 2)}
          </pre>
        </details>
      </div>
    </details>
  );
}

function Wrap({ children }) {
  return <div className="bg-[#161618] border border-white/[0.06] rounded-2xl">{children}</div>;
}

function Header({ meta }) {
  const start = fmtDate(meta.observation_start);
  const end   = fmtDate(meta.observation_end);
  return (
    <div className="px-4 py-2.5 border-b border-white/[0.06] flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="text-xs font-bold tracking-wider uppercase text-zinc-300">활용도 리포트</span>
      <span className="text-[10px] text-zinc-500 ml-auto tabular-nums">
        {start} ~ {end} · {meta.days_observed}일 · {meta.total_chargers}기
      </span>
    </div>
  );
}

function KpiGrid({ kpi }) {
  const fmt = (v) => v == null ? '—' : v.toFixed(1);
  const trend = kpi.trend_6m_delta_pp;
  const trendStr = trend == null
    ? '—'
    : (trend >= 0 ? '+' : '') + trend.toFixed(1);
  const trendColor = trend == null
    ? 'text-zinc-500'
    : (trend >= 0 ? 'text-blue-400' : 'text-rose-400');
  const trendLabel = trend == null
    ? '변화 없음'
    : (trend > 0 ? '↑ 증가' : trend < 0 ? '↓ 감소' : '→ 유지');

  // 전체 가동률 + 6개월 추세 + 일/주/월 표를 한 카드에 통합 — 세로 ~40% 압축.
  return (
    <div className="bg-black/20 rounded-lg overflow-hidden">
      <div className="grid grid-cols-2 divide-x divide-white/[0.04]">
        <div className="px-3 py-2.5 text-center">
          <div className="text-[10px] text-zinc-500 tracking-wider uppercase">전체 가동률</div>
          <div className="mt-1 leading-none">
            <span className="text-3xl font-black tabular-nums text-emerald-400">{fmt(kpi.overall_pct)}</span>
            <span className="text-xs text-zinc-600 ml-1">%</span>
          </div>
          <div className="text-[9px] text-zinc-600 mt-1">관측 전체 평균</div>
        </div>
        <div className="px-3 py-2.5 text-center">
          <div className="text-[10px] text-zinc-500 tracking-wider uppercase">6개월 추세</div>
          <div className="mt-1 leading-none">
            <span className={`text-3xl font-black tabular-nums ${trendColor}`}>{trendStr}</span>
            <span className="text-xs text-zinc-600 ml-1">%p</span>
          </div>
          <div className={`text-[9px] mt-1 ${trendColor}`}>{trendLabel}</div>
        </div>
      </div>
      <div className="border-t border-white/[0.04]">
        <div className="grid grid-cols-3 px-3 py-1 text-[9px] text-zinc-500 tracking-wider uppercase border-b border-white/[0.04]">
          <span></span>
          <span className="text-right">평균</span>
          <span className="text-right">피크</span>
        </div>
        {[
          { label: '일간', avg: kpi.daily_avg_pct,   peak: kpi.daily_peak_pct },
          { label: '주간', avg: kpi.weekly_avg_pct,  peak: kpi.weekly_peak_pct },
          { label: '월간', avg: kpi.monthly_avg_pct, peak: kpi.monthly_peak_pct },
        ].map((row) => (
          <div key={row.label} className="grid grid-cols-3 px-3 py-1.5 items-baseline border-b border-white/[0.03] last:border-0">
            <span className="text-[11px] font-bold text-zinc-300">{row.label}</span>
            <span className="text-right tabular-nums">
              <span className="text-base font-black text-emerald-400">{fmt(row.avg)}</span>
              <span className="text-[9px] text-zinc-600 ml-0.5">%</span>
            </span>
            <span className="text-right tabular-nums">
              <span className="text-base font-black text-amber-400">{fmt(row.peak)}</span>
              <span className="text-[9px] text-zinc-600 ml-0.5">%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeeklyLine({ weekly: monthly }) {
  if (!monthly?.length) {
    return <div className="bg-black/20 rounded-lg p-3 text-zinc-500 text-xs text-center">주별 데이터 부족</div>;
  }
  const W = 600, H = 170;
  const PAD_L = 32, PAD_R = 12, PAD_T = 22, PAD_B = 24;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  // y축은 0~100% 고정 — 점유율 척도 일관성 + 면 색칠 영역 안전.
  const occMax = 100;
  const sesMax = Math.max(1, ...monthly.map(m => m.sessions));
  const stepX = monthly.length === 1 ? 0 : innerW / (monthly.length - 1);

  const linePts = monthly.map((m, i) => {
    const x = PAD_L + i * stepX;
    const y = PAD_T + innerH - (m.occupancy_pct / occMax) * innerH;
    return [x, y, m];
  });
  const linePath = linePts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const barW = Math.max(4, stepX * 0.5);
  // 막대 높이 — innerH 의 50% 이내 (라인과 시각적 분리).
  const barMaxH = innerH * 0.5;

  return (
    <div className="bg-black/20 rounded-lg p-2.5">
      <div className="flex items-baseline justify-between mb-1 px-1">
        <span className="text-[10px] font-bold tracking-wider uppercase text-zinc-400">주별 점유율 추이</span>
        <span className="text-[9px] text-zinc-600">
          <span className="text-emerald-400">●</span> 점유율(%) ·
          <span className="text-blue-400/60 ml-1">▮</span> 세션
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block">
        {/* 그리드: 0/25/50/75/100 */}
        {[0, 25, 50, 75, 100].map((v) => {
          const y = PAD_T + innerH - (v / occMax) * innerH;
          return (
            <g key={v}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="#27272a" strokeDasharray="2,3" />
              <text x={PAD_L - 5} y={y + 3} textAnchor="end" fontSize="9" fill="#52525b" className="tabular-nums">
                {v}%
              </text>
            </g>
          );
        })}
        {/* 막대 (세션) — y는 항상 차트 영역 안 */}
        {linePts.map(([x, , m], i) => {
          const h = (m.sessions / sesMax) * barMaxH;
          return (
            <rect
              key={`bar-${i}`}
              x={x - barW / 2}
              y={PAD_T + innerH - h}
              width={barW}
              height={h}
              fill="#3b82f6"
              opacity="0.18"
            />
          );
        })}
        {/* 라인 + 점 */}
        <path d={linePath} fill="none" stroke="#34d399" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {linePts.map(([x, y, m], i) => (
          <g key={`pt-${i}`}>
            <circle cx={x} cy={y} r="2.5" fill="#34d399" />
            {/* 첫·마지막만 라벨 — 점이 차트 위쪽에 가까우면 점 아래로 표시 */}
            {(i === 0 || i === linePts.length - 1) && (() => {
              const above = y - PAD_T > 14;
              const ly = above ? y - 6 : y + 12;
              return (
                <text x={x} y={ly} fontSize="9" textAnchor="middle" fill="#a3e6c4" className="tabular-nums">
                  {m.occupancy_pct.toFixed(1)}%
                </text>
              );
            })()}
          </g>
        ))}
        {/* x축 라벨 (주 시작 월/일) */}
        {linePts.map(([x, , m], i) => {
          const showAll = monthly.length <= 8;
          const skip = showAll ? 1 : Math.ceil(monthly.length / 8);
          if (i % skip !== 0 && i !== monthly.length - 1) return null;
          return (
            <text
              key={`xl-${i}`}
              x={x}
              y={H - 6}
              fontSize="9"
              textAnchor="middle"
              fill="#71717a"
              className="tabular-nums"
            >
              {m.label /* MM/DD */}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function DongBars({ byDong }) {
  if (!byDong?.length) return null;
  const max = Math.max(10, ...byDong.map(d => d.occupancy_pct));
  return (
    <div className="bg-black/20 rounded-lg p-2.5">
      <div className="flex items-baseline justify-between mb-1.5 px-1">
        <span className="text-[10px] font-bold tracking-wider uppercase text-zinc-400">동별 가동률</span>
        <span className="text-[9px] text-zinc-600 inline-flex items-center gap-1"><Icon name="star" filled className="w-4 h-4 text-amber-400" />= 즐겨찾기 · 막대 = 점유율 %</span>
      </div>
      <div className="space-y-1.5">
        {byDong.map((d) => {
          const w = (d.occupancy_pct / max) * 100;
          const fillColor = d.favorite ? 'bg-amber-400/70' : 'bg-blue-400/50';
          return (
            <div key={d.key} className="flex items-center gap-2">
              {/* 좌: ⭐(즐겨찾기) + "119동 앞" 까지 안 잘리게. 우: "100.0% (12기)" 까지 안 잘리게. */}
              <div className="w-[88px] shrink-0 text-[10px] text-zinc-300 truncate" title={d.title}>
                {d.favorite && <Icon name="star" filled className="w-4 h-4 inline-block align-middle text-amber-400 mr-0.5" />}
                {d.title}
              </div>
              <div className="flex-1 h-3 bg-black/40 rounded-sm overflow-hidden">
                <div
                  className={`h-full ${fillColor}`}
                  style={{ width: `${Math.max(2, w)}%` }}
                />
              </div>
              <div className="w-[88px] shrink-0 text-right text-[10px] tabular-nums text-zinc-300 whitespace-nowrap">
                {d.occupancy_pct.toFixed(1)}% <span className="text-zinc-600">({d.total}기)</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-[9px] text-zinc-600 mt-2 leading-relaxed px-0.5">
        동별 충전기 가동률 = SUM(사용 슬롯) / (그 동 충전기수 × 관측 일수 × 48) × 100.
      </div>
    </div>
  );
}

function Footer() {
  return (
    <div className="text-[9px] text-zinc-600 leading-relaxed pt-1 px-1">
      출처: 환경공단 EV 충전 API · 30분 단위 정규화 (시간당 최대 2) · 1분 자동 갱신
    </div>
  );
}

function fmtDate(s) {
  if (!s) return '-';
  const d = new Date(s);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}.${m}.${dd}`;
}
