'use client';
import { formatHM } from '@/lib/kst';

function successRate(row) {
  if (!row || !row.attempts) return null;
  const ok = (row.successes || 0) + (row.partial || 0) + (row.retrySuccesses || 0);
  return Math.round((ok / row.attempts) * 100);
}

function cellClass(v, base = 'text-zinc-300') {
  return v > 0 ? `${base} font-semibold` : 'text-zinc-600';
}

export function TabButton({ active, onClick, children }) {
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

// 히트맵과 중복되는 폴링/성공/부분/재시도 카운트는 생략.
// 히트맵에 없는 지표(수동·쿼터히트+시각·재시도성공·성공률)만 요약.
export function SummaryCard({ totals, lastQuotaHitAt }) {
  const rate = successRate(totals);
  const manual = totals.manualAttempts || 0;
  const quotaHits = totals.quotaHits || 0;
  const retrySuccesses = totals.retrySuccesses || 0;
  const quotaTime = lastQuotaHitAt ? formatHM(lastQuotaHitAt) : null;
  return (
    <div className="bg-[#1a1a1c] border border-white/[0.06] rounded-lg px-3 py-1.5 text-[12px] tabular-nums">
      <div className="grid grid-cols-4 gap-1 text-center">
        <div>
          <div className="text-[9px] text-indigo-400">수동</div>
          <div className="text-indigo-300 font-semibold">{manual}</div>
        </div>
        <div>
          <div className="text-[9px] text-orange-500">쿼터</div>
          <div className="text-orange-400 font-semibold">
            {quotaHits}
            {quotaHits > 0 && quotaTime && (
              <span className="text-[9px] text-orange-300 ml-0.5">({quotaTime})</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-emerald-500">재시도✓</div>
          <div className="text-emerald-400 font-semibold">{retrySuccesses}</div>
        </div>
        <div>
          <div className="text-[9px] text-zinc-500">성공률</div>
          <div className="text-zinc-200 font-semibold">{rate != null ? `${rate}%` : '-'}</div>
        </div>
      </div>
    </div>
  );
}

export function HourlyTable({ rows, schedule, nowHour, isToday }) {
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

export function DailyTable({ rows, todayStr }) {
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
