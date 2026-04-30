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
    {
      label: '주평균',
      value: kpi.weekly_avg_pct != null ? kpi.weekly_avg_pct.toFixed(1) : '—',
      unit: '%',
      color: 'text-emerald-400',
      hint: '최근 7일',
    },
    {
      label: '평균 가동률',
      value: kpi.avg_occupancy_pct.toFixed(1),
      unit: '%',
      color: 'text-emerald-400',
      hint: '관측 전체',
    },
    {
      label: '피크 빈도',
      value: kpi.peak_freq_pct.toFixed(1),
      unit: '%',
      color: 'text-amber-400',
      hint: `점유 ${kpi.peak_freq_threshold_pct}%↑`,
    },
    {
      label: '6개월 추세',
      value: kpi.trend_6m_delta_pp == null
        ? '—'
        : (kpi.trend_6m_delta_pp >= 0 ? '+' : '') + kpi.trend_6m_delta_pp.toFixed(1),
      unit: '%p',
      color: kpi.trend_6m_delta_pp == null
        ? 'text-zinc-500'
        : (kpi.trend_6m_delta_pp >= 0 ? 'text-blue-400' : 'text-rose-400'),
      hint: '6달 평균차',
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
          <div className="text-[8px] text-zinc-600 mt-0.5">{c.hint}</div>
        </div>
      ))}
    </div>
  );
}

function MonthlyLine({ monthly }) {
  if (!monthly?.length) {
    return <div className="bg-black/20 rounded-lg p-3 text-zinc-500 text-xs text-center">월별 데이터 부족</div>;
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
        <span className="text-[10px] font-bold tracking-wider uppercase text-zinc-400">월별 점유율 추이</span>
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
        {/* x축 월 라벨 */}
        {linePts.map(([x, , m], i) => {
          const showAll = monthly.length <= 8;
          const skip = showAll ? 1 : Math.ceil(monthly.length / 8);
          if (i % skip !== 0 && i !== monthly.length - 1) return null;
          const [y, mm] = m.ym.split('-');
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
  const flat = grid.flat();
  const max = Math.max(1, ...flat);
  const cellW = 13, cellH = 12, gap = 2, labelW = 22, labelH = 12;
  const order = [1, 2, 3, 4, 5, 6, 0]; // 월~일

  return (
    <div className="bg-black/20 rounded-lg p-2.5">
      <div className="flex items-baseline justify-between mb-1 px-1">
        <span className="text-[10px] font-bold tracking-wider uppercase text-zinc-400">요일·시간대 점유율</span>
        {kpi.peak_dow != null && (
          <span className="text-[9px] text-zinc-600">
            피크: {DOW_KO[kpi.peak_dow]} {kpi.peak_hour}시 (가장 진한 셀)
          </span>
        )}
      </div>
      <svg
        width="100%"
        viewBox={`0 0 ${labelW + 24 * (cellW + gap)} ${labelH + 7 * (cellH + gap)}`}
        preserveAspectRatio="none"
        className="block"
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
            {h}시
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
              const isPeak = (dow === kpi.peak_dow && h === kpi.peak_hour);
              return (
                <g key={h}>
                  <rect
                    x={labelW + h * (cellW + gap)}
                    y={labelH + rowIdx * (cellH + gap)}
                    width={cellW}
                    height={cellH}
                    fill="#3b82f6"
                    opacity={op}
                    rx="1.5"
                  >
                    <title>{`${DOW_KO[dow]} ${h}시 — 평균 ${v.toFixed(1)}% 점유`}</title>
                  </rect>
                  {isPeak && (
                    <rect
                      x={labelW + h * (cellW + gap)}
                      y={labelH + rowIdx * (cellH + gap)}
                      width={cellW}
                      height={cellH}
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth="1.2"
                      rx="1.5"
                    />
                  )}
                </g>
              );
            })}
          </g>
        ))}
      </svg>
      <div className="text-[9px] text-zinc-600 mt-1.5 leading-relaxed px-0.5">
        한 셀 = 그 요일·시간대의 평균 점유율(%). 진할수록 사용 많음 · 노란 외곽선이 피크.
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
