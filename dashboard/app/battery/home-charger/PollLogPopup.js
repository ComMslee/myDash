'use client';
import { useEffect, useState } from 'react';

function kstTodayStr(offsetDays = 0) {
  const nowKstMs = Date.now() + 9 * 60 * 60_000 + offsetDays * 24 * 60 * 60_000;
  const d = new Date(nowKstMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

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

function formatHHMM(ms) {
  if (!ms) return null;
  const d = new Date(ms + 9 * 60 * 60_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
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
  const quotaTime = formatHHMM(lastQuotaHitAt);
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
          const dateStr = kstTodayStr(offset);
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

  const nowHour = (() => {
    const n = new Date(Date.now() + 9 * 60 * 60_000);
    return n.getUTCHours();
  })();
  const isToday = offset === 0;
  const todayStr = kstTodayStr(0);

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
              <div className="overflow-x-auto">
                {view === 'hourly' ? (
                  <HourlyTable
                    rows={data.hourly || []}
                    schedule={data.ttlInfo?.schedule}
                    nowHour={nowHour}
                    isToday={isToday}
                  />
                ) : (
                  <DailyTable rows={data.daily || []} todayStr={todayStr} />
                )}
              </div>

              <div className="text-[10px] text-zinc-600 leading-snug">
                * 시도 = 성공 + 부분 + 재시도 + 쿼터  ·  성공률 = (성공 + 부분) / 시도
                {view === 'hourly' && (
                  <>
                    <br />* 주기 = 해당 시간대의 현재 TTL (동적 학습 반영)
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
