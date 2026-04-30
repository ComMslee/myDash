'use client';

import { useEffect, useState } from 'react';

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

// 단지 충전 인프라 활용도 라이브 리포트.
// 외부(관리사무소·확장 제안 등) 근거자료용 — 실시간 갱신.

export default function ChargerReportPage() {
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
    const t = setInterval(load, 60_000); // 1분 갱신
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (err) return <div className="p-6 text-rose-400">에러: {err}</div>;
  if (!d) return <div className="p-6 text-zinc-500">로딩 중…</div>;
  if (!d.kpi) return <div className="p-6 text-zinc-500">데이터 누적 시작 전입니다.</div>;

  return (
    <main className="max-w-2xl mx-auto p-4 space-y-4 text-zinc-100">
      <Header meta={d.meta} />
      <KpiGrid kpi={d.kpi} />
      <MonthlyLine monthly={d.monthly} />
      <Heatmap grid={d.hourly_dow} kpi={d.kpi} />
      <Footer meta={d.meta} />
    </main>
  );
}

function Header({ meta }) {
  const start = fmtDate(meta.observation_start);
  const end   = fmtDate(meta.observation_end);
  return (
    <header className="border-b border-white/[0.06] pb-3">
      <div className="text-xs text-zinc-500 tracking-wider uppercase">충전 인프라 활용 리포트</div>
      <h1 className="text-lg font-bold mt-0.5">{meta.complex_name}</h1>
      <div className="text-[11px] text-zinc-500 mt-1">
        관측 {start} ~ {end} · {meta.days_observed}일 · {meta.total_chargers}기 (관측됨)
      </div>
    </header>
  );
}

function KpiGrid({ kpi }) {
  const cells = [
    { label: '총 누적 세션',     value: kpi.total_sessions.toLocaleString(), unit: '회', color: 'text-blue-400' },
    { label: '일평균 세션',      value: kpi.daily_avg_sessions.toFixed(1),   unit: '회', color: 'text-blue-400' },
    { label: '평균 가동률',      value: kpi.avg_occupancy_pct.toFixed(1),    unit: '%',  color: 'text-emerald-400' },
    {
      label: '최근 6개월 추세',
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
    <div className="grid grid-cols-2 gap-2">
      {cells.map((c) => (
        <div key={c.label} className="bg-[#161618] border border-white/[0.06] rounded-xl p-3">
          <div className="text-[10px] text-zinc-500 tracking-wider uppercase">{c.label}</div>
          <div className="mt-0.5">
            <span className={`text-2xl font-black tabular-nums ${c.color}`}>{c.value}</span>
            <span className="text-xs text-zinc-600 ml-1">{c.unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// 월별 점유율 라인 + 막대(세션 수) 콤보 — 단지 활용 안정성/추세의 핵심 차트.
function MonthlyLine({ monthly }) {
  if (!monthly?.length) {
    return (
      <section className="bg-[#161618] border border-white/[0.06] rounded-xl p-4 text-zinc-500 text-sm">
        월별 데이터가 충분하지 않습니다.
      </section>
    );
  }
  const W = 600, H = 180;
  const PAD_L = 32, PAD_R = 12, PAD_T = 16, PAD_B = 24;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const occMax = Math.max(10, ...monthly.map(m => m.occupancy_pct));
  const sesMax = Math.max(1, ...monthly.map(m => m.sessions));
  const stepX = monthly.length === 1 ? 0 : innerW / (monthly.length - 1);

  // 라인 (점유율)
  const linePts = monthly.map((m, i) => {
    const x = PAD_L + i * stepX;
    const y = PAD_T + innerH - (m.occupancy_pct / occMax) * innerH;
    return [x, y, m];
  });
  const linePath = linePts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

  // 막대 (세션) — 라인 뒤에 옅게.
  const barW = Math.max(4, stepX * 0.6);

  return (
    <section className="bg-[#161618] border border-white/[0.06] rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-bold tracking-wider uppercase text-zinc-400">월별 점유율 추이</h2>
        <div className="text-[10px] text-zinc-500">
          <span className="text-emerald-400">●</span> 점유율(%) ·
          <span className="text-blue-400/60 ml-1">▮</span> 세션
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
        {/* y축 점유율 0/50/max 라인 */}
        {[0, occMax / 2, occMax].map((v, i) => {
          const y = PAD_T + innerH - (v / occMax) * innerH;
          return (
            <g key={i}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="#27272a" strokeDasharray="2,3" />
              <text x={PAD_L - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#52525b" className="tabular-nums">
                {v.toFixed(0)}%
              </text>
            </g>
          );
        })}
        {/* 막대 (세션) */}
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
        {/* 라인 */}
        <path d={linePath} fill="none" stroke="#34d399" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {/* 점 + 라벨 */}
        {linePts.map(([x, y, m], i) => (
          <g key={`pt-${i}`}>
            <circle cx={x} cy={y} r="2.5" fill="#34d399" />
            {(i === 0 || i === linePts.length - 1 || i === Math.floor(linePts.length / 2)) && (
              <text x={x} y={y - 6} fontSize="9" textAnchor="middle" fill="#a3e6c4" className="tabular-nums">
                {m.occupancy_pct.toFixed(1)}%
              </text>
            )}
          </g>
        ))}
        {/* x축 라벨 (월) */}
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
      <div className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
        점유율 = 30분 단위 사용 슬롯 수 / (관측 충전기 × 일수 × 48) × 100. 막대는 월 누적 세션.
      </div>
    </section>
  );
}

function Heatmap({ grid, kpi }) {
  if (!grid) return null;
  const max = Math.max(1, ...grid.flat());
  const cellW = 13, cellH = 12, gap = 2;
  const labelW = 24, labelH = 14;

  // 0~6 = 일~토. 월요일 시작이 한국 사용자에 더 자연스러움.
  const order = [1, 2, 3, 4, 5, 6, 0];

  return (
    <section className="bg-[#161618] border border-white/[0.06] rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-bold tracking-wider uppercase text-zinc-400">시간대 × 요일 점유</h2>
        {kpi.peak_dow != null && (
          <div className="text-[10px] text-zinc-500">
            피크: {DOW_KO[kpi.peak_dow]}요일 {kpi.peak_hour}시
          </div>
        )}
      </div>
      <svg
        width="100%"
        viewBox={`0 0 ${labelW + 24 * (cellW + gap)} ${labelH + 7 * (cellH + gap)}`}
        className="overflow-visible"
      >
        {/* 시간 축 */}
        {[0, 6, 12, 18].map((h) => (
          <text
            key={h}
            x={labelW + h * (cellW + gap) + cellW / 2}
            y={labelH - 4}
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
                  <title>{`${DOW_KO[dow]} ${h}시 — ${v.toFixed(1)}% 점유`}</title>
                </rect>
              );
            })}
          </g>
        ))}
      </svg>
      <div className="text-[11px] text-zinc-500 mt-2">
        셀 = 그 시간/요일의 평균 점유율. 진할수록 사용 많음. 본 단지 전기차 충전 패턴 가시화.
      </div>
    </section>
  );
}

function Footer({ meta }) {
  return (
    <footer className="text-[10px] text-zinc-600 leading-relaxed border-t border-white/[0.04] pt-3 mt-2 space-y-0.5">
      <div>데이터 출처: 환경공단 전기차충전소 운영현황 공공 API</div>
      <div>집계: 충전기당 30분 단위 정규화 (시간당 최대 2회, 일 최대 48회) · 1~2분 폴링</div>
      <div>리포트 자동 갱신 1분 단위 · 본 페이지 화면 기준 시각</div>
    </footer>
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
