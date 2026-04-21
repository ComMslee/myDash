'use client';
import { useEffect, useState } from 'react';

// KST 오늘 기준 'YYYY-MM-DD' 문자열
function kstTodayStr(offsetDays = 0) {
  const nowKstMs = Date.now() + 9 * 60 * 60_000 + offsetDays * 24 * 60 * 60_000;
  const d = new Date(nowKstMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function successRate(row) {
  if (!row.attempts) return null;
  return Math.round(((row.successes + row.partial) / row.attempts) * 100);
}

// 셀 스타일 — 값 0일 때 흐리게
function cellClass(v, base = 'text-zinc-300') {
  return v > 0 ? `${base} font-semibold` : 'text-zinc-600';
}

export default function PollLogPopup({ onClose }) {
  const [offset, setOffset] = useState(0); // 0 = 오늘, -1 = 어제 ...
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
        const dateStr = kstTodayStr(offset);
        const res = await fetch(`/api/home-charger/poll-log?date=${dateStr}`, { cache: 'no-store' });
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
  }, [offset]);

  const rows = data?.hourly || [];
  const totals = data?.totals || { attempts: 0, successes: 0, partial: 0, retries: 0, quotaHits: 0 };
  const totalRate = successRate({ ...totals, attempts: totals.attempts });

  const nowHour = (() => {
    const n = new Date(Date.now() + 9 * 60 * 60_000);
    return n.getUTCHours();
  })();
  const isToday = offset === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full sm:max-w-lg bg-[#161618] border border-white/[0.08] rounded-2xl max-h-[80dvh] sm:max-h-[85vh] overflow-y-auto overscroll-contain"
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
          {/* 날짜 네비 */}
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

          {loading && (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
            </div>
          )}
          {error && <div className="text-[12px] text-rose-400">조회 실패 — {error}</div>}

          {!loading && !error && data && (
            <>
              {/* 합계 */}
              <div className="bg-[#1a1a1c] border border-white/[0.06] rounded-lg px-3 py-2 text-[12px] grid grid-cols-5 gap-1 tabular-nums text-center">
                <div>
                  <div className="text-[10px] text-zinc-500">시도</div>
                  <div className="text-zinc-200 font-semibold">{totals.attempts}</div>
                </div>
                <div>
                  <div className="text-[10px] text-emerald-500">성공</div>
                  <div className="text-emerald-400 font-semibold">{totals.successes}</div>
                </div>
                <div>
                  <div className="text-[10px] text-amber-500">부분</div>
                  <div className="text-amber-400 font-semibold">{totals.partial}</div>
                </div>
                <div>
                  <div className="text-[10px] text-rose-500">재시도</div>
                  <div className="text-rose-400 font-semibold">{totals.retries}</div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500">성공률</div>
                  <div className="text-zinc-200 font-semibold">{totalRate != null ? `${totalRate}%` : '-'}</div>
                </div>
              </div>

              {/* 시간대별 표 */}
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] tabular-nums">
                  <thead className="text-zinc-500">
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-left font-normal py-1 px-1">시간</th>
                      <th className="text-right font-normal py-1 px-1">시도</th>
                      <th className="text-right font-normal py-1 px-1">성공</th>
                      <th className="text-right font-normal py-1 px-1">부분</th>
                      <th className="text-right font-normal py-1 px-1">재시도</th>
                      <th className="text-right font-normal py-1 px-1">쿼터</th>
                      <th className="text-right font-normal py-1 px-1">성공률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const rate = successRate(r);
                      const isCurrent = isToday && r.hour === nowHour;
                      return (
                        <tr
                          key={r.hour}
                          className={`border-b border-white/[0.04] ${isCurrent ? 'bg-white/[0.04]' : ''}`}
                        >
                          <td className={`py-1 px-1 ${isCurrent ? 'text-amber-400 font-bold' : 'text-zinc-400'}`}>
                            {String(r.hour).padStart(2, '0')}시
                          </td>
                          <td className={`py-1 px-1 text-right ${cellClass(r.attempts, 'text-zinc-300')}`}>{r.attempts || '·'}</td>
                          <td className={`py-1 px-1 text-right ${cellClass(r.successes, 'text-emerald-400')}`}>{r.successes || '·'}</td>
                          <td className={`py-1 px-1 text-right ${cellClass(r.partial, 'text-amber-400')}`}>{r.partial || '·'}</td>
                          <td className={`py-1 px-1 text-right ${cellClass(r.retries, 'text-rose-400')}`}>{r.retries || '·'}</td>
                          <td className={`py-1 px-1 text-right ${cellClass(r.quotaHits, 'text-orange-400')}`}>{r.quotaHits || '·'}</td>
                          <td className={`py-1 px-1 text-right ${rate == null ? 'text-zinc-600' : rate === 100 ? 'text-emerald-400' : rate >= 80 ? 'text-zinc-300' : 'text-rose-400'}`}>
                            {rate == null ? '·' : `${rate}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="text-[10px] text-zinc-600 leading-snug">
                * 각 값은 시간 버킷의 누적치 (warmIfNeeded 호출 단위)
                <br />* 시도 = 성공 + 부분 + 재시도 + 쿼터
                <br />* 성공률 = (성공 + 부분) / 시도
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
