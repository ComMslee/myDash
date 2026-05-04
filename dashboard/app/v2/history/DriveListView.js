'use client';

import { useState, Fragment } from 'react';
import { KWH_PER_KM } from '@/lib/constants';
import { formatDuration, shortAddr } from '@/lib/format';

// 일별 g.items 를 시각적 묶음 단위(청크)로 분리.
//   stash  — 연속된 '이동주차' (≥2건이면 collapse, 1건이면 single 처리)
//   chain  — 같은 chain_id 인 '외출' leg 들 (≥2건 collapse, 펼치면 leg 들 amber bar 묶음)
//   single — 그 외 (일반 1행)
// items 는 reverse-chronological (최신 → 오래된) 순.
// absorbed 인 stash (도착/출발에 흡수된 것) 는 list 에서 제거 → 부모 drive 안으로 흡수.
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

// 0~24h 막대 — 주행 블록은 일관된 파란색 (tag 구분 없음 — 주행은 모두 동일 의미).
function DayTimelineBar({ items, dayStart }) {
  const visible = items.filter(d => !d.absorbed && d.start_date);
  if (!visible.length) return null;
  const dayMs = 86400000;
  return (
    <div className="relative h-2.5 bg-white/[0.04] rounded overflow-hidden">
      {visible.map(d => {
        const s = new Date(d.start_date) - dayStart;
        const eMs = d.end_date ? (new Date(d.end_date) - dayStart) : (s + 60000);
        const left = Math.max(0, Math.min(100, (s / dayMs) * 100));
        const right = Math.max(0, Math.min(100, (eMs / dayMs) * 100));
        const width = Math.max(0.4, right - left);
        return (
          <div
            key={d.id}
            className="absolute inset-y-0 bg-blue-400/80"
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        );
      })}
    </div>
  );
}

/**
 * 두 모드 운영:
 *   filterDate=null      — 월 그룹 + 일 카드 (스캔용 상단 리스트)
 *   filterDate='YYYY-MM-DD' — 그날의 라인 리스트만 (외출묶음/single/이동주차 청크 그대로)
 */
export default function DriveListView({
  drives, loadingDrives, error,
  onDriveClick, onDayClick, onMonthClick, onChainClick,
  driveDayStr, filterDate,
}) {
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

  // 청크 단위 라인 리스트 (filterDate 모드 — 일 상세 안에서 쓰임).
  const renderChunks = (items) => chunkItems(items).map((chunk, ci, arr) => {
    const nextChunk = arr[ci + 1];
    let chunkGap = null;
    if (nextChunk) {
      const curOldest = chunk.drives[chunk.drives.length - 1];
      const nextNewest = nextChunk.drives[0];
      if (curOldest?.start_date && nextNewest?.end_date) {
        const gapMs = new Date(curOldest.start_date) - new Date(nextNewest.end_date);
        if (gapMs > 0) chunkGap = formatDuration(Math.round(gapMs / 60000));
      }
    }

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

    // chunkItems 는 *연속* 외출만 묶음 → chain leg 사이에 stash 가 끼면 같은 chain_id 가
    // 두 청크로 쪼개져 1-leg chain 이 됨. 그땐 묶음 의미가 없어 single 행으로 폴백.
    if (chunk.kind === 'chain' && chunk.drives.length >= 2) {
      const drives = chunk.drives;
      const expanded = expandedChunks.has(chunk.key);
      const firstLeg = drives[drives.length - 1];
      const lastLeg = drives[0];
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
                onClick={() => (onChainClick ? onChainClick(chunk.chainId) : onDriveClick(firstLeg))}
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

    const d = chunk.drives[0];
    return (
      <Fragment key={chunk.key}>
        {renderRow(d)}
        {chunkGap && renderGap(chunkGap, chunk.key + '-cgap')}
      </Fragment>
    );
  });

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
    if (!d.absorbed) {
      g.distance += parseFloat(d.distance) || 0;
      if (d.start_rated_range_km && d.end_rated_range_km) {
        const usedKm = parseFloat(d.start_rated_range_km) - parseFloat(d.end_rated_range_km);
        if (usedKm > 0) g.kwh += usedKm * KWH_PER_KM;
      }
      if (d.start_battery_level != null && d.end_battery_level != null) {
        g.usedPct += Math.max(0, d.start_battery_level - d.end_battery_level);
      }
    }
  });

  // === 모드 1: filterDate (단일 일 상세 — 라인 리스트만) ===
  if (filterDate) {
    const g = groups.find(x => x.dateStr === filterDate);
    if (!g) return <p className="text-zinc-500 text-sm text-center py-4">해당 날짜 주행 없음</p>;
    return <>{renderChunks(g.items)}</>;
  }

  // === 모드 2: 기본 (월 그룹 → 일 카드) ===
  const monthOrder = [];
  const monthMap = new Map();
  groups.forEach(g => {
    const mk = g.dateStr.slice(0, 7);
    let m = monthMap.get(mk);
    if (!m) {
      m = { mk, days: [], distance: 0, kwh: 0, usedPct: 0, driveCount: 0 };
      monthMap.set(mk, m);
      monthOrder.push(mk);
    }
    m.days.push(g);
    m.distance += g.distance;
    m.kwh += g.kwh;
    m.usedPct += g.usedPct;
    m.driveCount += g.items.filter(d => !d.absorbed).length;
  });

  // 일 카드 — 24h 막대 + 시간 범위/운전·정차 시간/총량.
  const renderDayCard = (g) => {
    const weekday = WEEKDAY_KO[g.firstDate.getDay()];
    const visible = g.items.filter(d => !d.absorbed);
    if (!visible.length) return null;
    const driveCount = visible.length;
    const sortedAsc = [...visible].sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    const first = sortedAsc[0];
    const last = sortedAsc[sortedAsc.length - 1];
    const fmt = (s) => { const dt = new Date(s); return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`; };
    const driveTotalMin = visible.reduce((s, d) => s + (parseFloat(d.duration_min) || 0), 0);
    // 정차시간 = drive 사이 gap 합 (양수만)
    let stayMin = 0;
    for (let i = 1; i < sortedAsc.length; i++) {
      const prev = sortedAsc[i - 1];
      const cur = sortedAsc[i];
      if (prev.end_date && cur.start_date) {
        const gap = (new Date(cur.start_date) - new Date(prev.end_date)) / 60000;
        if (gap > 0) stayMin += gap;
      }
    }
    const dayStart = new Date(g.firstDate);
    dayStart.setHours(0, 0, 0, 0);
    return (
      <button
        key={g.key}
        type="button"
        onClick={() => onDayClick(g.dateStr)}
        className="w-full text-left flex flex-col gap-2 px-3 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.025] active:bg-blue-500/10 transition-colors"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-zinc-200 tabular-nums flex-shrink-0">
            {g.firstDate.getMonth() + 1}/{g.firstDate.getDate()}
            <span className="text-[10px] text-zinc-600 font-normal ml-0.5">({weekday})</span>
          </span>
          <div className="text-right tabular-nums flex-shrink-0">
            <span className="text-sm font-bold text-blue-400">{g.distance.toFixed(0)}<span className="text-[10px] text-zinc-600 ml-0.5">km</span></span>
            {g.kwh > 0 && (
              <span className="text-xs text-green-400/80 ml-2">
                {g.kwh.toFixed(1)}<span className="ml-0.5">kWh</span>
                {g.usedPct > 0 && <span className="text-zinc-500 ml-1">({g.usedPct}%)</span>}
              </span>
            )}
          </div>
        </div>
        <DayTimelineBar items={visible} dayStart={dayStart} />
        <div className="flex items-center gap-2 text-[11px] text-zinc-500 tabular-nums flex-wrap">
          <span>{fmt(first.start_date)} → {fmt(last.end_date || last.start_date)}</span>
          <span className="text-zinc-700">·</span>
          <span>주행 {driveCount}회</span>
          {driveTotalMin > 0 && (
            <>
              <span className="text-zinc-700">·</span>
              <span>운전 {formatDuration(Math.round(driveTotalMin))}</span>
            </>
          )}
          {stayMin > 0 && (
            <>
              <span className="text-zinc-700">·</span>
              <span>정차 {formatDuration(Math.round(stayMin))}</span>
            </>
          )}
        </div>
      </button>
    );
  };

  // 일 카드 사이 gap — 이전 일 첫 출발 - 다음 일 마지막 도착 (drives 는 reverse-chronological).
  const renderCrossDayGap = (curG, nextG, key) => {
    const curOldest = curG.items[curG.items.length - 1];   // 시간상 그날 첫 주행
    const nextNewest = nextG.items[0];                      // 시간상 다음(=과거) 일 마지막 주행
    if (!curOldest?.start_date || !nextNewest?.end_date) return null;
    const ms = new Date(curOldest.start_date) - new Date(nextNewest.end_date);
    if (ms <= 0) return null;
    return (
      <div key={key} className="flex items-center gap-2 px-3 py-1 bg-black/40 border-y border-white/[0.06]">
        <div className="flex-1 h-px bg-white/[0.06]" />
        <span className="text-[10px] text-zinc-600 tabular-nums">{formatDuration(Math.round(ms / 60000))}</span>
        <div className="flex-1 h-px bg-white/[0.06]" />
      </div>
    );
  };

  return (
    <>
      {monthOrder.map(mk => {
        const m = monthMap.get(mk);
        const expanded = expandedMonths.has(mk);
        return (
          <Fragment key={mk}>
            {/* 월 헤더 — 큰 영역=상세보기 / 우측 chevron=펼치기 */}
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
              const nextDay = idx + 1 < m.days.length ? m.days[idx + 1] : null;
              const nodes = [renderDayCard(g)];
              if (nextDay) {
                const gapNode = renderCrossDayGap(g, nextDay, g.key + '-xgap');
                if (gapNode) nodes.push(gapNode);
              }
              return nodes;
            })}
          </Fragment>
        );
      })}
    </>
  );
}
