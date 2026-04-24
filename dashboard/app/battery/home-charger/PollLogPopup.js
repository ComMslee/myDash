'use client';
import { useEffect, useState } from 'react';
import { formatHM, kstDateStr, KST_OFFSET_MS } from '@/lib/kst';

function successRate(row) {
  if (!row || !row.attempts) return null;
  const ok = (row.successes || 0) + (row.partial || 0) + (row.retrySuccesses || 0);
  return Math.round((ok / row.attempts) * 100);
}

function cellClass(v, base = 'text-zinc-300') {
  return v > 0 ? `${base} font-semibold` : 'text-zinc-600';
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-1.5 text-[12px] font-medium rounded-md transition ${
        active ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {children}
    </button>
  );
}

function formatDuration(ms) {
  if (!ms || ms < 0) return '-';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, '0')}`;
}

// 서버 인스트루멘테이션 진단 카드 — 백그라운드 폴링 루프 생존 여부 체크
// 주의: lastWarmAt은 실제 upstream fetch 시점이라 캐시가 fresh하면 오래돼 보이는 게 정상.
//       루프 생존은 tickCallCount(setInterval 콜백 카운터)로 판정.
const TICK_INTERVAL_MS = 2 * 60_000;
function WarmDiagCard({ diag }) {
  if (!diag) return null;
  const now = Date.now();
  const sinceLastWarm = diag.lastWarmAt ? now - diag.lastWarmAt : null;
  const sinceLastTick = diag.lastTickAt ? now - diag.lastTickAt : null;
  const sinceBoot = diag.processStartedAt ? now - diag.processStartedAt : null;
  // 기대 tick 수 = floor(uptime / interval) + 1 (기동 즉시 1회 포함)
  const expectedTicks = sinceBoot != null ? Math.floor(sinceBoot / TICK_INTERVAL_MS) + 1 : 0;
  const actualTicks = diag.tickCallCount || 0;
  // tick이 interval+여유(30s) 이상 안 뛰거나, 기대치 대비 2회 이상 빠지면 정체
  const tickStale =
    (sinceLastTick != null && sinceLastTick > TICK_INTERVAL_MS + 30_000) ||
    (expectedTicks - actualTicks >= 2);
  return (
    <div className="bg-[#1a1a1c] border border-white/[0.06] rounded-lg px-3 py-2 text-[11px] tabular-nums space-y-1">
      <div className="text-[10px] text-zinc-500 font-semibold">서버 백그라운드 상태</div>
      <div className="grid grid-cols-4 gap-1 text-center">
        <div>
          <div className="text-[10px] text-zinc-500">마지막 tick</div>
          <div className={tickStale ? 'text-rose-400 font-semibold' : 'text-emerald-400 font-semibold'}>
            {sinceLastTick != null ? `${formatDuration(sinceLastTick)} 전` : '-'}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500">tick 수</div>
          <div className="text-zinc-200 font-semibold">
            {actualTicks}
            {expectedTicks > 0 && (
              <span className="text-[9px] text-zinc-500 ml-0.5">/{expectedTicks}</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500">warm 수</div>
          <div className="text-zinc-300 font-semibold">
            {diag.warmCallCount || 0}
            {sinceLastWarm != null && (
              <span className="text-[9px] text-zinc-500 ml-0.5">({formatDuration(sinceLastWarm)})</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500">기동 후</div>
          <div className="text-zinc-300 font-semibold">{sinceBoot != null ? formatDuration(sinceBoot) : '-'}</div>
        </div>
      </div>
      {tickStale && (
        <div className="text-[10px] text-rose-400">
          ⚠️ 2분 주기 tick이 정체. 인스트루멘테이션 루프가 죽었을 수 있음.
        </div>
      )}
    </div>
  );
}

function SummaryCard({ totals, lastQuotaHitAt }) {
  const rate = successRate(totals);
  const manual = totals.manualAttempts || 0;
  const auto = Math.max(0, (totals.attempts || 0) - manual);
  const quotaHits = totals.quotaHits || 0;
  const successes = totals.successes || 0;
  const partial = totals.partial || 0;
  const retries = totals.retries || 0;
  const retrySuccesses = totals.retrySuccesses || 0;
  const quotaTime = lastQuotaHitAt ? formatHM(lastQuotaHitAt) : null;
  return (
    <div className="bg-[#1a1a1c] border border-white/[0.06] rounded-lg px-3 py-2 space-y-1.5 text-[12px] tabular-nums">
      {/* 호출 소스 · 쿼터 */}
      <div className="grid grid-cols-3 gap-1 text-center">
        <div>
          <div className="text-[10px] text-sky-500">폴링</div>
          <div className="text-sky-400 font-semibold">{auto}</div>
        </div>
        <div>
          <div className="text-[10px] text-indigo-400">수동</div>
          <div className="text-indigo-300 font-semibold">{manual}</div>
        </div>
        <div>
          <div className="text-[10px] text-orange-500">쿼터 히트</div>
          <div className="text-orange-400 font-semibold">
            {quotaHits}
            {quotaHits > 0 && quotaTime && (
              <span className="text-[9px] text-orange-300 ml-1">({quotaTime})</span>
            )}
          </div>
        </div>
      </div>
      <div className="border-t border-white/[0.06]" />
      {/* 결과(부분) · 재시도(성공) · 성공률 */}
      <div className="grid grid-cols-3 gap-1 text-center">
        <div>
          <div className="text-[10px] text-emerald-500">성공 (부분)</div>
          <div>
            <span className="text-emerald-400 font-semibold">{successes}</span>
            <span className="text-amber-400 text-[10px] ml-0.5">({partial})</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] text-rose-500">재시도 (성공)</div>
          <div>
            <span className="text-rose-400 font-semibold">{retries}</span>
            <span className="text-emerald-400 text-[10px] ml-0.5">({retrySuccesses})</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500">성공률</div>
          <div className="text-zinc-200 font-semibold">{rate != null ? `${rate}%` : '-'}</div>
        </div>
      </div>
    </div>
  );
}

function HourlyTable({ rows, schedule, nowHour, isToday }) {
  // 구분선 — 부분 | 재시도 · 재시도✓ | 성공률
  const sep = 'border-l border-white/[0.05]';
  return (
    <table className="w-full text-[11px] tabular-nums">
      <thead className="text-zinc-500">
        <tr className="border-b border-white/[0.06]">
          <th className="text-left font-normal py-1 px-1">시간</th>
          <th className="text-right font-normal py-1 px-1">주기</th>
          <th className="text-right font-normal py-1 px-1" title="시도 (수동)">시도</th>
          <th className="text-right font-normal py-1 px-1">성공</th>
          <th className="text-right font-normal py-1 px-1">부분</th>
          <th className={`text-right font-normal py-1 px-1 ${sep}`} title="재시도 실패">재시도</th>
          <th className="text-right font-normal py-1 px-1" title="재시도 성공">재시도✓</th>
          <th className={`text-right font-normal py-1 px-1 ${sep}`}>성공률</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const rate = successRate(r);
          const isCurrent = isToday && r.hour === nowHour;
          const ttl = schedule?.[r.hour];
          const manual = r.manualAttempts || 0;
          return (
            <tr key={r.hour} className={`border-b border-white/[0.04] ${isCurrent ? 'bg-white/[0.04]' : ''}`}>
              <td className={`py-1 px-1 ${isCurrent ? 'text-amber-400 font-bold' : 'text-zinc-400'}`}>
                {String(r.hour).padStart(2, '0')}시
              </td>
              <td className="py-1 px-1 text-right text-zinc-500">{ttl != null ? `${ttl}분` : '-'}</td>
              <td className={`py-1 px-1 text-right ${cellClass(r.attempts, 'text-zinc-300')}`}>
                {r.attempts ? r.attempts : '·'}
                {manual > 0 && <span className="text-indigo-400 text-[9px] ml-0.5">({manual})</span>}
              </td>
              <td className={`py-1 px-1 text-right ${cellClass(r.successes, 'text-emerald-400')}`}>{r.successes || '·'}</td>
              <td className={`py-1 px-1 text-right ${cellClass(r.partial, 'text-amber-400')}`}>{r.partial || '·'}</td>
              <td className={`py-1 px-1 text-right ${cellClass(r.retries, 'text-rose-400')} ${sep}`}>{r.retries || '·'}</td>
              <td className={`py-1 px-1 text-right ${cellClass(r.retrySuccesses, 'text-emerald-400')}`}>{r.retrySuccesses || '·'}</td>
              <td className={`py-1 px-1 text-right ${sep} ${rate == null ? 'text-zinc-600' : rate === 100 ? 'text-emerald-400' : rate >= 80 ? 'text-zinc-300' : 'text-rose-400'}`}>
                {rate == null ? '·' : `${rate}%`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// 지표별 색상 팔레트 — 5지표 히트맵 + 실패(재시도)
const METRIC_COLORS = {
  attempts:  '#3b82f6', // 시도 — blue
  successes: '#10b981', // 성공 — emerald
  partial:   '#f59e0b', // 부분 — amber
  retries:   '#f43f5e', // 재시도 실패 — rose
  quotaHits: '#fb923c', // 쿼터 — orange
};

// 공통 히트맵 행: [라벨][24셀][합][보조]
// - 피크 셀 amber 하이라이트 (행 내부 최댓값)
// - opacity: v === 0 ? 0.08 : 0.18 + ratio * 0.82
function HeatmapRow({ label, values, max, color, cellHeight = 'h-4', primary, secondary, cellTitle }) {
  let peakIdx = -1;
  let peakVal = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] > peakVal) { peakVal = values[i]; peakIdx = i; }
  }
  return (
    <div className="flex items-center gap-1.5 text-[10px] tabular-nums">
      <span className="w-10 shrink-0 text-[11px] text-zinc-400 truncate">{label}</span>
      <div className={`flex-1 flex gap-0.5 ${cellHeight}`}>
        {values.map((v, i) => {
          const ratio = max > 0 ? v / max : 0;
          const isPeak = i === peakIdx && v > 0;
          return (
            <div
              key={i}
              className="flex-1 rounded-[3px]"
              style={{
                background: isPeak ? '#f59e0b' : color,
                opacity: v === 0 ? 0.08 : 0.18 + ratio * 0.82,
              }}
              title={cellTitle ? cellTitle(i, v) : `${String(i).padStart(2, '0')}시 · ${label} ${v}`}
            />
          );
        })}
      </div>
      <span className="w-8 shrink-0 text-right text-zinc-300 font-semibold">{primary}</span>
      <span className="w-10 shrink-0 text-right text-zinc-500">{secondary}</span>
    </div>
  );
}

function HeatmapXAxis({ primaryLabel = '합', secondaryLabel = '피크' }) {
  return (
    <div className="flex items-center gap-1.5 text-[9px] text-zinc-600 tabular-nums">
      <span className="w-10 shrink-0" />
      <div className="flex-1 flex justify-between px-px">
        <span className="font-semibold">0시</span><span>6</span><span>12</span><span>18</span><span>23시</span>
      </div>
      <span className="w-8 shrink-0 text-right">{primaryLabel}</span>
      <span className="w-10 shrink-0 text-right">{secondaryLabel}</span>
    </div>
  );
}

// 시간별 탭: 5지표 × 24시간 히트맵 (한 날짜 기준)
function MetricHeatmap5Row({ hourly }) {
  const metrics = [
    { key: 'attempts',  label: '시도' },
    { key: 'successes', label: '성공' },
    { key: 'partial',   label: '부분' },
    { key: 'retries',   label: '재실패' },
    { key: 'quotaHits', label: '쿼터' },
  ];
  return (
    <div className="space-y-1">
      <HeatmapXAxis />
      {metrics.map(m => {
        const values = hourly.map(r => r[m.key] || 0);
        const sum = values.reduce((a, b) => a + b, 0);
        const rowMax = Math.max(1, ...values);
        const peakIdx = sum > 0 ? values.indexOf(Math.max(...values)) : -1;
        return (
          <HeatmapRow
            key={m.key}
            label={m.label}
            values={values}
            max={rowMax}
            color={METRIC_COLORS[m.key]}
            primary={sum > 0 ? sum : '·'}
            secondary={peakIdx >= 0 ? `${peakIdx}시` : '-'}
            cellTitle={(h, v) => `${String(h).padStart(2, '0')}시 · ${m.label} ${v}`}
          />
        );
      })}
    </div>
  );
}

// 일별 탭: N일 × 24시간 실패(재시도실패+쿼터) 히트맵
function DailyFailureHeatmap({ dailyByHour, daily, todayStr }) {
  const dailyMap = new Map((daily || []).map(d => [d.date, d]));
  // opacity 스케일: 전체 셀 중 최댓값
  let globalMax = 0;
  for (const d of dailyByHour) {
    for (const h of d.hours) {
      const fail = (h.retries || 0) + (h.quotaHits || 0);
      if (fail > globalMax) globalMax = fail;
    }
  }
  globalMax = Math.max(1, globalMax);
  const cellHeight = dailyByHour.length > 20 ? 'h-3' : 'h-4';
  return (
    <div className="space-y-1">
      <HeatmapXAxis secondaryLabel="성공률" />
      {dailyByHour.length === 0 && (
        <div className="text-center text-zinc-600 py-4 text-[11px]">기록된 일별 데이터 없음</div>
      )}
      {dailyByHour.map(d => {
        const values = d.hours.map(h => (h.retries || 0) + (h.quotaHits || 0));
        const sum = values.reduce((a, b) => a + b, 0);
        const rowForDate = dailyMap.get(d.date);
        const rate = successRate(rowForDate);
        const rateLabel = rate == null ? '-' : `${rate}%`;
        const dateLabel = d.date.slice(5).replace('-', '/');
        const isToday = d.date === todayStr;
        return (
          <HeatmapRow
            key={d.date}
            label={<span className={isToday ? 'text-amber-400 font-semibold' : undefined}>{dateLabel}</span>}
            values={values}
            max={globalMax}
            color={METRIC_COLORS.retries}
            cellHeight={cellHeight}
            primary={sum > 0 ? sum : '·'}
            secondary={rateLabel}
            cellTitle={(h, v) => {
              const row = d.hours[h];
              return `${dateLabel} ${String(h).padStart(2, '0')}시 · 실패 ${v}` +
                (row.attempts ? ` / 시도 ${row.attempts}` : '');
            }}
          />
        );
      })}
    </div>
  );
}

function DailyTable({ rows, todayStr }) {
  const sep = 'border-l border-white/[0.05]';
  return (
    <table className="w-full text-[11px] tabular-nums">
      <thead className="text-zinc-500">
        <tr className="border-b border-white/[0.06]">
          <th className="text-left font-normal py-1 px-1">날짜</th>
          <th className="text-right font-normal py-1 px-1" title="시도 (수동)">시도</th>
          <th className="text-right font-normal py-1 px-1">성공</th>
          <th className="text-right font-normal py-1 px-1">부분</th>
          <th className={`text-right font-normal py-1 px-1 ${sep}`} title="재시도 실패">재시도</th>
          <th className="text-right font-normal py-1 px-1" title="재시도 성공">재시도✓</th>
          <th className={`text-right font-normal py-1 px-1 ${sep}`}>성공률</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const rate = successRate(r);
          const isToday = r.date === todayStr;
          const manual = r.manualAttempts || 0;
          return (
            <tr key={r.date} className={`border-b border-white/[0.04] ${isToday ? 'bg-white/[0.04]' : ''}`}>
              <td className={`py-1 px-1 ${isToday ? 'text-amber-400 font-bold' : 'text-zinc-400'}`}>
                {r.date.slice(5).replace('-', '/')}
                {isToday ? ' (오늘)' : ''}
              </td>
              <td className={`py-1 px-1 text-right ${cellClass(r.attempts, 'text-zinc-300')}`}>
                {r.attempts || '·'}
                {manual > 0 && <span className="text-indigo-400 text-[9px] ml-0.5">({manual})</span>}
              </td>
              <td className={`py-1 px-1 text-right ${cellClass(r.successes, 'text-emerald-400')}`}>{r.successes || '·'}</td>
              <td className={`py-1 px-1 text-right ${cellClass(r.partial, 'text-amber-400')}`}>{r.partial || '·'}</td>
              <td className={`py-1 px-1 text-right ${cellClass(r.retries, 'text-rose-400')} ${sep}`}>{r.retries || '·'}</td>
              <td className={`py-1 px-1 text-right ${cellClass(r.retrySuccesses, 'text-emerald-400')}`}>{r.retrySuccesses || '·'}</td>
              <td className={`py-1 px-1 text-right ${sep} ${rate == null ? 'text-zinc-600' : rate === 100 ? 'text-emerald-400' : rate >= 80 ? 'text-zinc-300' : 'text-rose-400'}`}>
                {rate == null ? '·' : `${rate}%`}
              </td>
            </tr>
          );
        })}
        {rows.length === 0 && (
          <tr>
            <td colSpan={7} className="text-center text-zinc-600 py-4 text-[11px]">기록된 일별 데이터 없음</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export default function PollLogPopup({ onClose }) {
  const [view, setView] = useState('hourly'); // 'hourly' | 'daily'
  const [mode, setMode] = useState('heatmap'); // 'heatmap' | 'table'
  const [offset, setOffset] = useState(0); // 시간별 보기 — 0 = 오늘
  const [days, setDays] = useState(14);     // 일별 보기 — 최근 N일
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        let url;
        if (view === 'daily') {
          url = `/api/home-charger/poll-log?view=daily&days=${days}`;
        } else {
          const dateStr = kstDateStr(Date.now(), offset);
          url = `/api/home-charger/poll-log?date=${dateStr}`;
        }
        const res = await fetch(url, { cache: 'no-store' });
        const d = await res.json();
        if (!alive) return;
        if (d.error) setError(d.error);
        else setData(d);
      } catch (e) {
        if (alive) setError(e.message || '조회 실패');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [view, offset, days]);

  const nowHour = new Date(Date.now() + KST_OFFSET_MS).getUTCHours();
  const isToday = offset === 0;
  const todayStr = kstDateStr(Date.now());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full sm:max-w-lg bg-[#161618] border border-white/[0.08] rounded-2xl max-h-[85dvh] sm:max-h-[85vh] overflow-y-auto overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-[#161618] border-b border-white/[0.06] px-4 py-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-200">폴링 로그</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-7 h-7 rounded-md hover:bg-white/[0.06] flex items-center justify-center text-zinc-400 hover:text-zinc-200"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-2.5 space-y-3">
          {/* 탭 */}
          <div className="flex gap-1 bg-[#1a1a1c] border border-white/[0.06] rounded-md p-0.5">
            <TabButton active={view === 'hourly'} onClick={() => setView('hourly')}>시간별</TabButton>
            <TabButton active={view === 'daily'} onClick={() => setView('daily')}>일별</TabButton>
          </div>

          {/* 네비 */}
          {view === 'hourly' ? (
            <div className="flex items-center justify-between text-[12px]">
              <button
                type="button"
                onClick={() => setOffset(o => o - 1)}
                className="px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300"
              >
                ◀ 이전
              </button>
              <span className="tabular-nums text-zinc-200 font-semibold">
                {data?.date || '-'}{isToday ? ' (오늘)' : ''}
              </span>
              <button
                type="button"
                onClick={() => setOffset(o => Math.min(0, o + 1))}
                disabled={offset >= 0}
                className="px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 disabled:opacity-30"
              >
                다음 ▶
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-zinc-500">최근</span>
              <div className="flex gap-1">
                {[7, 14, 30].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setDays(n)}
                    className={`px-2 py-1 rounded text-[11px] ${
                      days === n ? 'bg-white/[0.08] text-zinc-100' : 'bg-white/[0.04] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {n}일
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
            </div>
          )}
          {error && <div className="text-[12px] text-rose-400">조회 실패 — {error}</div>}

          {!loading && !error && data && (
            <>
              <SummaryCard totals={data.totals || {}} lastQuotaHitAt={data.lastQuotaHitAt || 0} />
              <WarmDiagCard diag={data.warmDiag} />

              {/* 보기 모드 토글 (히트맵 / 표) */}
              <div className="flex items-center justify-between gap-2">
                {view === 'hourly' && mode === 'heatmap' && data.ttlInfo ? (
                  <div className="text-[10px] text-zinc-500 tabular-nums">
                    현재 TTL: <span className="text-zinc-300 font-semibold">{data.ttlInfo.currentMin}분</span>
                    <span className="text-zinc-600 ml-1">({data.ttlInfo.currentHour}시)</span>
                  </div>
                ) : (<span />)}
                <div className="flex gap-0.5 bg-[#1a1a1c] border border-white/[0.06] rounded p-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setMode('heatmap')}
                    className={`px-2 py-0.5 text-[10px] rounded ${mode === 'heatmap' ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >히트맵</button>
                  <button
                    type="button"
                    onClick={() => setMode('table')}
                    className={`px-2 py-0.5 text-[10px] rounded ${mode === 'table' ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >표</button>
                </div>
              </div>

              <div className="overflow-x-auto">
                {view === 'hourly' ? (
                  mode === 'heatmap' ? (
                    <MetricHeatmap5Row hourly={data.hourly || []} />
                  ) : (
                    <HourlyTable
                      rows={data.hourly || []}
                      schedule={data.ttlInfo?.schedule}
                      nowHour={nowHour}
                      isToday={isToday}
                    />
                  )
                ) : (
                  mode === 'heatmap' ? (
                    <DailyFailureHeatmap
                      dailyByHour={data.dailyByHour || []}
                      daily={data.daily || []}
                      todayStr={todayStr}
                    />
                  ) : (
                    <DailyTable rows={data.daily || []} todayStr={todayStr} />
                  )
                )}
              </div>

              <div className="text-[10px] text-zinc-600 leading-snug">
                * 시도 = 성공 + 부분 + 재시도 + 쿼터  ·  성공률 = (성공 + 부분 + 재시도✓) / 시도
                {view === 'hourly' && mode === 'table' && (
                  <>
                    <br />* 주기 = 해당 시간대의 현재 TTL (동적 학습 반영)
                  </>
                )}
                {mode === 'heatmap' && view === 'daily' && (
                  <>
                    <br />* 실패 = 재시도실패 + 쿼터 (피크 셀 amber)
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
