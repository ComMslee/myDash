'use client';

import { useState, Fragment } from 'react';
import { KWH_PER_KM } from '@/lib/constants';
import { formatDuration, shortAddr } from '@/lib/format';

// 일별 g.items 를 시각적 묶음 단위(청크)로 분리.
//   stash  — 연속된 '이동주차' (≥2건이면 collapse, 1건이면 single 처리)
//   chain  — 같은 chain_id 인 '외출' leg 들 (≥2건 collapse, 펼치면 leg 들 amber bar 묶음)
//   single — 그 외 (일반 1행)
// items 는 reverse-chronological (최신 → 오래된) 순.
// absorbed 인 stash (도착 후 흡수된 것) 는 list 에서 제거 → 부모 drive 안으로 흡수.
function chunkItems(rawItems) {
  const items = rawItems.filter(d => !d.absorbed);
  const chunks = [];
  let i = 0;
  while (i < items.length) {
    const d = items[i];
    if (d.tag === '이동주차') {
      const drives = [];
      while (i < items.length && items[i].tag === '이동주차') {
        drives.push(items[i]); i++;
      }
      chunks.push({ kind: 'stash', drives, key: 'stash:' + drives[0].id });
    } else if (d.tag === '외출' && d.chain_id != null) {
      const cid = d.chain_id;
      const drives = [];
      while (i < items.length && items[i].chain_id === cid && items[i].tag === '외출') {
        drives.push(items[i]); i++;
      }
      chunks.push({ kind: 'chain', drives, chainId: cid, key: 'chain:' + cid });
    } else {
      chunks.push({ kind: 'single', drives: [d], key: 'single:' + d.id });
      i++;
    }
  }
  return chunks;
}

function efficiency(d) {
  if (!d.start_rated_range_km || !d.end_rated_range_km || !d.distance) return null;
  const dist = parseFloat(d.distance);
  const usedKm = parseFloat(d.start_rated_range_km) - parseFloat(d.end_rated_range_km);
  if (usedKm <= 0 || !dist || dist === 0) return null;
  const kwh = (usedKm * KWH_PER_KM).toFixed(1);
  const perKm = ((usedKm * KWH_PER_KM * 1000) / dist).toFixed(0);
  return { kwh, perKm };
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

// KST 기준 현재 'YYYY-MM' — 이번 달 펼침 기본값 계산용
function currentMonthKey() {
  const kst = new Date(Date.now() + 9 * 3600000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`;
}

// 'YYYY-MM' → '24/03 (3월)' 라벨 (현재 연도면 연도 생략)
function formatMonthLabel(mk) {
  const [y, m] = mk.split('-');
  const currentYear = new Date().getFullYear();
  const yLabel = parseInt(y) === currentYear ? '' : `${y.slice(2)}년 `;
  return `${yLabel}${parseInt(m)}월`;
}

export default function DriveListView({ drives, loadingDrives, error, onDriveClick, onDayClick, onMonthClick, driveDayStr }) {
  const [expandedMonths, setExpandedMonths] = useState(() => new Set([currentMonthKey()]));
  const [expandedChunks, setExpandedChunks] = useState(() => new Set());
  const toggleMonth = (mk) => setExpandedMonths(prev => {
    const next = new Set(prev);
    if (next.has(mk)) next.delete(mk); else next.add(mk);
    return next;
  });
  const toggleChunk = (key) => setExpandedChunks(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // 단일 주행 행 — single / stash-펼침 / chain-펼침 leg 모두 공유.
  // indent: 펼침 wrapper 안에서 좌측 padding 살짝 증가 (좌측 bar 와 간격).
  const renderRow = (d, opts = {}) => {
    const { indent } = opts;
    const eff = efficiency(d);
    const dt = new Date(d.start_date);
    const timeLabel = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    const endTime = d.end_date
      ? `${String(new Date(d.end_date).getHours()).padStart(2, '0')}:${String(new Date(d.end_date).getMinutes()).padStart(2, '0')}`
      : null;
    const startPct = d.start_battery_level ?? null;
    const endPct = d.end_battery_level ?? null;
    const usedPct = (startPct != null && endPct != null) ? Math.max(0, startPct - endPct) : 0;
    return (
      <button
        onClick={() => onDriveClick(d)}
        className={`w-full text-left grid grid-cols-[44px_1fr_auto] items-center gap-2 ${indent ? 'pl-4' : 'pl-3'} pr-3 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.025] active:bg-blue-500/10 transition-colors`}
      >
        <div className="text-xs text-zinc-500 tabular-nums leading-tight">
          <p>{timeLabel}</p>
          {endTime && <p className="text-zinc-600">{endTime}</p>}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-zinc-300 truncate">
            {shortAddr(d.start_address) || '?'}<span className="text-zinc-600 mx-1">→</span>{shortAddr(d.end_address) || '?'}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-zinc-600 tabular-nums">{formatDuration(d.duration_min)}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-blue-400 tabular-nums">{d.distance}<span className="text-xs font-medium text-zinc-600 ml-0.5">km</span></p>
          {eff && (
            <p className="text-xs text-green-400/80 tabular-nums">
              {eff.kwh}<span className="ml-0.5">kWh</span>
              {usedPct > 0 && <span className="text-zinc-500 ml-1">({usedPct}%)</span>}
            </p>
          )}
        </div>
      </button>
    );
  };

  // gap 라인 — chunk 간 (zinc) / chain 안 leg 간 (amber/15) 두 톤.
  const renderGap = (label, key, opts = {}) => (
    <div key={key} className={`flex items-center gap-2 px-3 py-0.5 ${opts.inChain ? '' : 'bg-[#111]'}`}>
      <div className={`flex-1 h-px ${opts.inChain ? 'bg-amber-500/15' : 'bg-white/[0.04]'}`} />
      <span className="text-xs text-zinc-600 tabular-nums">{label}</span>
      <div className={`flex-1 h-px ${opts.inChain ? 'bg-amber-500/15' : 'bg-white/[0.04]'}`} />
    </div>
  );

  if (loadingDrives) {
    return (
      <div className="flex items-center justify-center h-24">
        <div className="w-6 h-6 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }
  if (error) return <p className="text-red-400 text-sm text-center py-4">{error}</p>;
  if (!drives.length) return <p className="text-zinc-500 text-sm text-center py-4">주행 기록이 없습니다</p>;

  // 일별 그룹핑 (순서 보존)
  const groups = [];
  let currentKey = null;
  drives.forEach(d => {
    const dt = new Date(d.start_date);
    const key = dt.toDateString();
    if (key !== currentKey) {
      groups.push({ key, dateStr: driveDayStr(d), firstDate: dt, items: [], distance: 0, kwh: 0, usedPct: 0 });
      currentKey = key;
    }
    const g = groups[groups.length - 1];
    g.items.push(d);
    g.distance += parseFloat(d.distance) || 0;
    if (d.start_rated_range_km && d.end_rated_range_km) {
      const usedKm = parseFloat(d.start_rated_range_km) - parseFloat(d.end_rated_range_km);
      if (usedKm > 0) g.kwh += usedKm * KWH_PER_KM;
    }
    if (d.start_battery_level != null && d.end_battery_level != null) {
      g.usedPct += Math.max(0, d.start_battery_level - d.end_battery_level);
    }
  });

  // 월별 묶음 (순서 보존)
  const monthOrder = [];
  const monthMap = new Map();
  groups.forEach((g, gi) => {
    const mk = g.dateStr.slice(0, 7);
    let m = monthMap.get(mk);
    if (!m) {
      m = { mk, days: [], dayIdx: [], distance: 0, kwh: 0, usedPct: 0, driveCount: 0 };
      monthMap.set(mk, m);
      monthOrder.push(mk);
    }
    m.days.push(g);
    m.dayIdx.push(gi);
    m.distance += g.distance;
    m.kwh += g.kwh;
    m.usedPct += g.usedPct;
    m.driveCount += g.items.length;
  });

  // 일별 그룹 노드 렌더링 (기존 로직 — gi는 전체 groups 인덱스, crossGap은 같은 달 내에서만)
  const renderDay = (g, gi, sameMonthNext) => {
    const weekday = WEEKDAY_KO[g.firstDate.getDay()];
    const multi = g.items.length > 1;

    let crossGap = null;
    if (sameMonthNext) {
      const curOldest = g.items[g.items.length - 1];
      const nextNewest = sameMonthNext.items[0];
      if (curOldest?.start_date && nextNewest?.end_date) {
        const ms = new Date(curOldest.start_date) - new Date(nextNewest.end_date);
        if (ms > 0) crossGap = formatDuration(Math.round(ms / 60000));
      }
    }

    const groupNode = (
      <div key={g.key} className="flex">
        {/* 좌측 날짜 박스 — 일 합계 탭 */}
        <button
          type="button"
          onClick={() => onDayClick(g.dateStr)}
          className="flex-shrink-0 w-[72px] bg-white/[0.02] hover:bg-white/[0.05] active:bg-blue-500/10 border-r border-white/[0.06] flex flex-col items-center justify-center py-2.5 tabular-nums transition-colors"
        >
          <span className="text-sm font-bold text-zinc-300 leading-none">
            {g.firstDate.getMonth() + 1}/{g.firstDate.getDate()}
            <span className="text-[10px] text-zinc-600 font-normal ml-0.5">({weekday})</span>
          </span>
          {multi && (
            <>
              <span aria-hidden="true" className="block h-3" />
              <span className="text-[11px] font-bold text-blue-400 leading-none">
                {g.distance.toFixed(0)}<span className="text-zinc-600 font-normal ml-0.5">km</span>
              </span>
              {g.usedPct > 0 && (
                <span className="text-[10px] text-zinc-500 leading-none mt-1">{g.usedPct}%</span>
              )}
            </>
          )}
        </button>

        {/* 우측 주행 목록 — chunk(stash/chain/single) 단위 */}
        <div className="flex-1 min-w-0">
          {chunkItems(g.items).map((chunk, ci, arr) => {
            const nextChunk = arr[ci + 1];
            // chunk 간 gap = 위 chunk 의 가장 오래된 drive 의 start - 아래 chunk 의 가장 최신 drive 의 end
            let chunkGap = null;
            if (nextChunk) {
              const curOldest = chunk.drives[chunk.drives.length - 1];
              const nextNewest = nextChunk.drives[0];
              if (curOldest?.start_date && nextNewest?.end_date) {
                const gapMs = new Date(curOldest.start_date) - new Date(nextNewest.end_date);
                if (gapMs > 0) chunkGap = formatDuration(Math.round(gapMs / 60000));
              }
            }

            // === 이동주차 ≥2건 → 좌측 zinc bar + [상세보기 | 펼치기] 헤더 ===
            if (chunk.kind === 'stash' && chunk.drives.length >= 2) {
              const expanded = expandedChunks.has(chunk.key);
              const totalKm = chunk.drives.reduce((s, x) => s + (parseFloat(x.distance) || 0), 0);
              const totalUsedPct = chunk.drives.reduce((s, x) => {
                if (x.start_battery_level != null && x.end_battery_level != null) {
                  return s + Math.max(0, x.start_battery_level - x.end_battery_level);
                }
                return s;
              }, 0);
              const firstStash = chunk.drives[chunk.drives.length - 1];
              const oldestDt = new Date(firstStash.start_date);
              const fmt = (dt) => `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
              return (
                <Fragment key={chunk.key}>
                  <div className="border-l-2 border-zinc-700/50">
                    <div className="flex items-stretch">
                      <button
                        type="button"
                        onClick={() => onDriveClick(firstStash)}
                        className="flex-1 min-w-0 text-left grid grid-cols-[44px_1fr] items-center gap-2 pl-3 pr-2 py-2 border-b border-white/[0.04] hover:bg-white/[0.025] active:bg-blue-500/10 transition-colors"
                      >
                        <div className="text-xs text-zinc-600 tabular-nums">{fmt(oldestDt)}</div>
                        <p className="text-sm text-zinc-500 truncate">
                          이동주차 {chunk.drives.length}건
                          {totalKm > 0 && (
                            <span className="text-zinc-600 text-xs ml-2 tabular-nums">· {totalKm.toFixed(1)}km</span>
                          )}
                          {totalUsedPct > 0 && (
                            <span className="text-zinc-600 text-xs ml-1.5 tabular-nums">({totalUsedPct}%)</span>
                          )}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleChunk(chunk.key)}
                        className="px-3 flex items-center text-xs text-zinc-500 border-l border-white/[0.06] border-b border-white/[0.04] hover:bg-white/[0.05] active:bg-white/[0.08] transition-colors"
                        title={expanded ? '접기' : '펼치기'}
                      >
                        {expanded ? '▾' : '▸'}
                      </button>
                    </div>
                    {expanded && chunk.drives.map(d => (
                      <Fragment key={d.id}>{renderRow(d, { indent: true })}</Fragment>
                    ))}
                  </div>
                  {chunkGap && renderGap(chunkGap, chunk.key + '-cgap')}
                </Fragment>
              );
            }

            // === 외출 chain → 좌측 amber bar + [상세보기 | 펼치기] 헤더 + S→a→b→E path ===
            // chunkItems 는 items 배열의 *연속* 외출만 묶는다. chain leg 사이에 stash 가
            // 끼면 같은 chain_id 가 두 청크로 쪼개져 1-leg chain bundle 이 만들어짐 →
            // 이때는 묶음 의미가 없으니 single 행으로 폴백.
            if (chunk.kind === 'chain' && chunk.drives.length >= 2) {
              const drives = chunk.drives;
              const expanded = expandedChunks.has(chunk.key);
              const firstLeg = drives[drives.length - 1]; // 시간상 처음 출발 (S)
              const lastLeg = drives[0];                  // 시간상 마지막 도착 (E)
              const totalKm = drives.reduce((s, x) => s + (parseFloat(x.distance) || 0), 0);
              const totalMin = drives.reduce((s, x) => s + (parseFloat(x.duration_min) || 0), 0);
              const totalUsedPct = drives.reduce((s, x) => {
                if (x.start_battery_level != null && x.end_battery_level != null) {
                  return s + Math.max(0, x.start_battery_level - x.end_battery_level);
                }
                return s;
              }, 0);
              const totalKwh = drives.reduce((s, x) => {
                if (x.start_rated_range_km && x.end_rated_range_km) {
                  const u = parseFloat(x.start_rated_range_km) - parseFloat(x.end_rated_range_km);
                  if (u > 0) return s + u * KWH_PER_KM;
                }
                return s;
              }, 0);
              const firstDt = new Date(firstLeg.start_date);
              const lastDt = new Date(lastLeg.end_date || lastLeg.start_date);
              const fmt = (dt) => `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
              // 시간순 path: S → 경유1 → 경유2 → ... → E (= leg[0].start, leg[0].end, leg[1].end, ...)
              const ascDrives = [...drives].reverse();
              const pathLabels = [
                shortAddr(ascDrives[0].start_address) || '?',
                ...ascDrives.map(d => shortAddr(d.end_address) || '?'),
              ];
              return (
                <Fragment key={chunk.key}>
                  <div className="border-l-2 border-amber-500/30">
                    <div className="flex items-stretch">
                      <button
                        type="button"
                        onClick={() => onDriveClick(firstLeg)}
                        className="flex-1 min-w-0 text-left grid grid-cols-[44px_1fr_auto] items-center gap-2 pl-3 pr-2 py-3 border-b border-white/[0.04] hover:bg-white/[0.025] active:bg-blue-500/10 transition-colors"
                      >
                        <div className="text-xs text-zinc-500 tabular-nums leading-tight">
                          <p>{fmt(firstDt)}</p>
                          <p className="text-zinc-600">{fmt(lastDt)}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-zinc-300 break-words">{pathLabels.join(' → ')}</p>
                          <p className="text-xs text-zinc-600 tabular-nums mt-0.5">
                            {drives.length}회 · {formatDuration(Math.round(totalMin))}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-blue-400 tabular-nums">{totalKm.toFixed(1)}<span className="text-xs font-medium text-zinc-600 ml-0.5">km</span></p>
                          {totalKwh > 0 && (
                            <p className="text-xs text-green-400/80 tabular-nums">
                              {totalKwh.toFixed(1)}<span className="ml-0.5">kWh</span>
                              {totalUsedPct > 0 && <span className="text-zinc-500 ml-1">({totalUsedPct}%)</span>}
                            </p>
                          )}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleChunk(chunk.key)}
                        className="px-3 flex items-center text-xs text-zinc-500 border-l border-white/[0.06] border-b border-white/[0.04] hover:bg-white/[0.05] active:bg-white/[0.08] transition-colors"
                        title={expanded ? '접기' : '펼치기'}
                      >
                        {expanded ? '▾' : '▸'}
                      </button>
                    </div>
                    {expanded && drives.map((d, idx) => {
                      const next = drives[idx + 1];
                      let gapLabel = null;
                      if (next && d.start_date && next.end_date) {
                        const gapMs = new Date(d.start_date) - new Date(next.end_date);
                        if (gapMs > 0) gapLabel = formatDuration(Math.round(gapMs / 60000));
                      }
                      return (
                        <Fragment key={d.id}>
                          {renderRow(d, { indent: true })}
                          {gapLabel && renderGap(gapLabel, d.id + '-igap', { inChain: true })}
                        </Fragment>
                      );
                    })}
                  </div>
                  {chunkGap && renderGap(chunkGap, chunk.key + '-cgap')}
                </Fragment>
              );
            }

            // === 일반 1행 (또는 이동주차 1건) ===
            const d = chunk.drives[0];
            return (
              <Fragment key={chunk.key}>
                {renderRow(d)}
                {chunkGap && renderGap(chunkGap, chunk.key + '-cgap')}
              </Fragment>
            );
          })}
        </div>
      </div>
    );

    const nodes = [groupNode];
    if (crossGap) {
      nodes.push(
        <div key={g.key + '-xgap'} className="flex items-center gap-2 px-3 py-1 bg-black/40 border-y border-white/[0.08]">
          <div className="flex-1 h-px bg-white/[0.06]" />
          <span className="text-[10px] text-zinc-600 tabular-nums">{crossGap}</span>
          <div className="flex-1 h-px bg-white/[0.06]" />
        </div>
      );
    }
    return nodes;
  };

  return (
    <>
      {monthOrder.map(mk => {
        const m = monthMap.get(mk);
        const expanded = expandedMonths.has(mk);
        return (
          <Fragment key={mk}>
            {/* 월 헤더 — 큰 영역=상세보기 / 우측 chevron=펼치기 (주행 묶음과 동일 패턴) */}
            <div className="flex items-stretch border-t border-white/[0.10] bg-white/[0.04]">
              <button
                onClick={() => (onMonthClick ? onMonthClick(mk) : toggleMonth(mk))}
                className="flex-1 flex items-center gap-2 px-3 py-2 hover:bg-white/[0.05] active:bg-white/[0.08] transition-colors text-left min-w-0"
                title={onMonthClick ? '이 달 전체 지도/순위 보기' : (expanded ? '접기' : '펼치기')}
              >
                <span className="text-xs font-bold text-zinc-300 flex-shrink-0">{formatMonthLabel(mk)}</span>
                <span className="text-[10px] text-zinc-600 tabular-nums truncate">
                  {m.driveCount}회 · {m.distance.toFixed(0)}km
                  {m.usedPct > 0 && <span className="text-zinc-700"> · {m.usedPct}%</span>}
                </span>
              </button>
              <button
                onClick={() => toggleMonth(mk)}
                className="px-3 flex items-center text-zinc-500 border-l border-white/[0.06] hover:bg-white/[0.05] active:bg-white/[0.08] transition-colors"
                title={expanded ? '접기' : '펼치기'}
              >
                <svg className={`w-3 h-3 transition-transform ${expanded ? '' : '-rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            {expanded && m.days.flatMap((g, idx) => {
              const gi = m.dayIdx[idx];
              const sameMonthNext = idx + 1 < m.days.length ? m.days[idx + 1] : null;
              return renderDay(g, gi, sameMonthNext);
            })}
          </Fragment>
        );
      })}
    </>
  );
}
