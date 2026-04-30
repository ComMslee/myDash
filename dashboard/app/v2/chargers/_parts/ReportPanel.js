'use client';

import { useEffect, useState } from 'react';

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

// 단지 충전 인프라 활용도 라이브 패널.
// /v2/chargers 페이지 하단 인라인 + /v2/chargers/report 별도 페이지 캡처용 공유.
export default function ReportPanel() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch('/api/home-charger/report', { cache: 'no-store' });
        const j = await r.json();
        if (!alive) return;
        if (j.error) setErr(j.error); else setD(j);
      } catch (e) {
        if (alive) setErr(e.message || '로딩 실패');
      }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (err) return <Wrap><div className="p-4 text-rose-400 text-sm">에러: {err}</div></Wrap>;
  if (!d)  return <Wrap><div className="p-4 text-zinc-500 text-sm">로딩 중…</div></Wrap>;
  if (!d.kpi) return <Wrap><div className="p-4 text-zinc-500 text-sm">데이터 누적 시작 전입니다.</div></Wrap>;

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <Header meta={d.meta} />
      <div className="p-3 space-y-3">
        <KpiGrid kpi={d.kpi} />
        <MonthlyLine monthly={d.monthly} />
        <Heatmap grid={d.hourly_dow} kpi={d.kpi} />
        <Footer />
      </div>
    </div>
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
      <span className="text-base">📊</span>
      <span className="text-xs font-bold tracking-wider uppercase text-zinc-300">활용도 리포트</span>
      <span className="text-[10px] text-zinc-500 ml-auto">
        {start} ~ {end} · {meta.days_observed}일 · {meta.total_chargers}기
      </span>
    </div>
  );
}

function KpiGrid({ kpi }) {
  const cells = [
    { label: '누적 세션',     value: kpi.total_sessions.toLocaleString(),  unit: '회',  color: 'text-blue-400' },
    { label: '일평균',        value: kpi.daily_avg_sessions.toFixed(1),    unit: '회',  color: 'text-blue-400' },
    { label: '평균 가동률',   value: kpi.avg_occupancy_pct.toFixed(1),     unit: '%',   color: 'text-emerald-400' },
    {
      label: '6개월 추세',
      value: kpi.trend_6m_delta_pp == null
        ? '—'
        : (kpi.trend_6m_delta_pp >= 0 ? '+' : '') + kpi.trend_6m_delta_pp.toFixed(1),
      unit: '%p',
      color: kpi.trend_6m_delta_pp == null
        ? 'text-zinc-500'
        : (kpi.trend_6m_delta_pp >= 0 ? 'text-amber-400' : 'text-rose-400'),
    },
  ];
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {cells.map((c) => (
        <div key={c.label} className="bg-black/20 rounded-lg p-2 text-center">
          <div className="text-[9px] text-zinc-500 tracking-wider uppercase truncate">{c.label}</div>
          <div className="mt-0.5 leading-tight">
            <span className={`text-lg font-black tabular-nums ${c.color}`}>{c.value}</span>
            <span className="text-[9px] text-zinc-600 ml-0.5">{c.unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function MonthlyLine({ monthly }) {
  if (!monthly?.length) {
    return <div className="bg-black/20 rounded-lg p-3 text-zinc-500 text-xs text-center">월별 데이터 부족</div>;
  }
  const W = 600, H = 140;
  const PAD_L = 28, PAD_R = 8, PAD_T = 12, PAD_B = 20;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const occMax = Math.max(10, ...monthly.map(m => m.occupancy_pct));
  const sesMax = Math.max(1, ...monthly.map(m => m.sessions));
  const stepX = monthly.length === 1 ? 0 : innerW / (monthly.length - 1);

  const linePts = monthly.map((m, i) => {
    const x = PAD_L + i * stepX;
    const y = PAD_T + innerH - (m.occupancy_pct / occMax) * innerH;
    return [x, y, m];
  });
  const linePath = linePts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const barW = Math.max(4, stepX * 0.55);

  return (
    <div className="bg-black/20 rounded-lg p-2.5">
      <div className="flex items-baseline justify-between mb-1 px-1">
        <span className="text-[10px] font-bold tracking-wider uppercase text-zinc-400">월별 점유율 추이</span>
        <span className="text-[9px] text-zinc-600">
          <span className="text-emerald-400">●</span> 점유율 ·
          <span className="text-blue-400/60 ml-1">▮</span> 세션
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="overflow-visible block">
        {[0, occMax / 2, occMax].map((v, i) => {
          const y = PAD_T + innerH - (v / occMax) * innerH;
          return (
            <g key={i}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="#27272a" strokeDasharray="2,3" />
              <text x={PAD_L - 4} y={y + 3} textAnchor="end" fontSize="9" fill="#52525b" className="tabular-nums">
                {v.toFixed(0)}%
              </text>
            </g>
          );
        })}
        {linePts.map(([x, , m], i) => {
          const h = (m.sessions / sesMax) * innerH * 0.75;
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
        <path d={linePath} fill="none" stroke="#34d399" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {linePts.map(([x, y, m], i) => (
          <g key={`pt-${i}`}>
            <circle cx={x} cy={y} r="2.5" fill="#34d399" />
            {(i === 0 || i === linePts.length - 1) && (
              <text x={x} y={y - 5} fontSize="9" textAnchor="middle" fill="#a3e6c4" className="tabular-nums">
                {m.occupancy_pct.toFixed(1)}%
              </text>
            )}
          </g>
        ))}
        {linePts.map(([x, , m], i) => {
          const showAll = monthly.length <= 8;
          const skip = showAll ? 1 : Math.ceil(monthly.length / 8);
          if (i % skip !== 0 && i !== monthly.length - 1) return null;
          const [y, mm] = m.ym.split('-');
          return (
            <text
              key={`xl-${i}`}
              x={x}
              y={H - 4}
              fontSize="9"
              textAnchor="middle"
              fill="#71717a"
              className="tabular-nums"
            >
              {y.slice(2)}/{mm}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function Heatmap({ grid, kpi }) {
  if (!grid) return null;
  const max = Math.max(1, ...grid.flat());
  const cellW = 13, cellH = 12, gap = 2, labelW = 22, labelH = 12;
  const order = [1, 2, 3, 4, 5, 6, 0]; // 월~일

  return (
    <div className="bg-black/20 rounded-lg p-2.5">
      <div className="flex items-baseline justify-between mb-1 px-1">
        <span className="text-[10px] font-bold tracking-wider uppercase text-zinc-400">시간대 × 요일 점유</span>
        {kpi.peak_dow != null && (
          <span className="text-[9px] text-zinc-600">
            피크: {DOW_KO[kpi.peak_dow]}요일 {kpi.peak_hour}시
          </span>
        )}
      </div>
      <svg
        width="100%"
        viewBox={`0 0 ${labelW + 24 * (cellW + gap)} ${labelH + 7 * (cellH + gap)}`}
        preserveAspectRatio="none"
        className="overflow-visible block"
      >
        {[0, 6, 12, 18].map((h) => (
          <text
            key={h}
            x={labelW + h * (cellW + gap) + cellW / 2}
            y={labelH - 3}
            fontSize="8"
            textAnchor="middle"
            fill="#71717a"
            className="tabular-nums"
          >
            {h}
          </text>
        ))}
        {order.map((dow, rowIdx) => (
          <g key={dow}>
            <text
              x={labelW - 4}
              y={labelH + rowIdx * (cellH + gap) + cellH - 2}
              fontSize="9"
              textAnchor="end"
              fill="#71717a"
            >
              {DOW_KO[dow]}
            </text>
            {grid[dow].map((v, h) => {
              const intensity = v / max;
              const op = 0.05 + intensity * 0.95;
              return (
                <rect
                  key={h}
                  x={labelW + h * (cellW + gap)}
                  y={labelH + rowIdx * (cellH + gap)}
                  width={cellW}
                  height={cellH}
                  fill="#3b82f6"
                  opacity={op}
                  rx="1.5"
                >
                  <title>{`${DOW_KO[dow]} ${h}시 — ${v.toFixed(1)}%`}</title>
                </rect>
              );
            })}
          </g>
        ))}
      </svg>
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
