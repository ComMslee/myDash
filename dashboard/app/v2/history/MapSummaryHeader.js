'use client';

import { Icon } from '@/app/lib/Icons';
import { KWH_PER_KM } from '@/lib/constants';
import { formatDuration, formatHm, shortAddr, formatDwellSec } from '@/lib/format';
import { formatTimeRange, kstDateStr, kstMondayStr } from '@/lib/kst';

function efficiency(d) {
  if (!d.start_rated_range_km || !d.end_rated_range_km || !d.distance) return null;
  const dist = parseFloat(d.distance);
  const usedKm = parseFloat(d.start_rated_range_km) - parseFloat(d.end_rated_range_km);
  if (usedKm <= 0 || !dist || dist === 0) return null;
  const kwh = (usedKm * KWH_PER_KM).toFixed(1);
  const perKm = ((usedKm * KWH_PER_KM * 1000) / dist).toFixed(0);
  return { kwh, perKm };
}

function WeekSummary({ drives, weekMode }) {
  const wDrives = drives
    .filter(d => kstMondayStr(`${kstDateStr(d.start_date)}T00:00:00Z`) === weekMode)
    .slice()
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
  if (wDrives.length === 0) return null;
  const totalKm = wDrives.reduce((s, d) => s + (parseFloat(d.distance) || 0), 0);
  const totalMin = wDrives.reduce((s, d) => s + (parseFloat(d.duration_min) || 0), 0);
  const totalKwh = wDrives.reduce((s, d) => {
    if (d.start_rated_range_km && d.end_rated_range_km) {
      const usedKm = parseFloat(d.start_rated_range_km) - parseFloat(d.end_rated_range_km);
      if (usedKm > 0) return s + usedKm * KWH_PER_KM;
    }
    return s;
  }, 0);
  const usedPct = wDrives.reduce((s, d) => (d.start_battery_level != null && d.end_battery_level != null) ? s + Math.max(0, d.start_battery_level - d.end_battery_level) : s, 0);
  const perKm = totalKm > 0 && totalKwh > 0 ? Math.round((totalKwh * 1000) / totalKm) : null;
  const dayCount = new Set(wDrives.map(d => kstDateStr(d.start_date))).size;
  const destMap = new Map();
  const SKIP_DESTS = new Set(['집', '회사']);
  for (const d of wDrives) {
    const key = shortAddr(d.end_address) || '?';
    if (SKIP_DESTS.has(key)) continue;
    destMap.set(key, (destMap.get(key) || 0) + 1);
  }
  const topDests = Array.from(destMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const weekLabel = (() => {
    const mon = new Date(weekMode + 'T00:00:00Z');
    const sun = new Date(mon.getTime() + 6 * 86400000);
    const todayMonKey = kstMondayStr(Date.now());
    const diff = Math.round((new Date(todayMonKey + 'T00:00:00Z').getTime() - mon.getTime()) / (7 * 86400000));
    const tag = diff === 0 ? '이번 주' : diff === 1 ? '지난 주' : `${diff}주 전`;
    const fm = mon.getUTCMonth() + 1, fd = mon.getUTCDate();
    const lm = sun.getUTCMonth() + 1, ld = sun.getUTCDate();
    const range = fm === lm ? `${fm}/${fd} ~ ${ld}` : `${fm}/${fd} ~ ${lm}/${ld}`;
    return `${tag} (${range})`;
  })();

  return (
    <div className="px-4 py-1.5 border-b border-white/[0.06] flex flex-col gap-0.5 flex-shrink-0">
      <p className="text-sm text-zinc-500 tabular-nums flex items-center gap-1.5 flex-wrap">
        <span className="text-zinc-300 font-semibold">{weekLabel}</span>
        <span className="text-zinc-700">·</span>
        <span title="주행" className="inline-flex items-center gap-0.5"><Icon name="car" />{wDrives.length}회</span>
        <span className="text-zinc-700">·</span>
        <span title="운행일" className="inline-flex items-center gap-0.5"><Icon name="calendar" />{dayCount}일</span>
        {totalMin > 0 && (
          <>
            <span className="text-zinc-700">·</span>
            <span title="운전" className="inline-flex items-center gap-0.5"><Icon name="road" />{formatHm(Math.round(totalMin))}</span>
          </>
        )}
      </p>
      <p className="text-xs tabular-nums flex items-center gap-1.5 flex-wrap">
        <span className="font-bold text-blue-400">{totalKm.toFixed(0)}<span className="text-zinc-600 ml-0.5">km</span></span>
        {totalKwh > 0 && (
          <>
            <span className="text-zinc-700">·</span>
            <span className="font-semibold text-green-400">{totalKwh.toFixed(1)}<span className="text-zinc-600 ml-0.5">kWh</span>{usedPct > 0 && <span className="text-zinc-500 ml-1">({usedPct}%)</span>}</span>
          </>
        )}
        {perKm != null && (
          <>
            <span className="text-zinc-700">·</span>
            <span className="text-amber-400">{perKm}<span className="text-zinc-600 ml-0.5">Wh/km</span></span>
          </>
        )}
      </p>
      {topDests.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
          <Icon name="star" className="w-4 h-4 flex-shrink-0 text-amber-400" />
          {topDests.map(([addr, n], i) => (
            <span key={addr} className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 truncate max-w-[140px]">
              <span className="text-zinc-600 mr-1">{i + 1}</span>{addr}<span className="text-zinc-500 ml-1 tabular-nums">{n}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MonthSummary({ drives, monthMode }) {
  const mDrives = drives
    .filter(d => kstDateStr(d.start_date).slice(0, 7) === monthMode)
    .slice()
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
  if (mDrives.length === 0) return null;
  const totalKm = mDrives.reduce((s, d) => s + (parseFloat(d.distance) || 0), 0);
  const totalMin = mDrives.reduce((s, d) => s + (parseFloat(d.duration_min) || 0), 0);
  const totalKwh = mDrives.reduce((s, d) => {
    if (d.start_rated_range_km && d.end_rated_range_km) {
      const usedKm = parseFloat(d.start_rated_range_km) - parseFloat(d.end_rated_range_km);
      if (usedKm > 0) return s + usedKm * KWH_PER_KM;
    }
    return s;
  }, 0);
  const usedPct = mDrives.reduce((s, d) => (d.start_battery_level != null && d.end_battery_level != null) ? s + Math.max(0, d.start_battery_level - d.end_battery_level) : s, 0);
  const perKm = totalKm > 0 && totalKwh > 0 ? Math.round((totalKwh * 1000) / totalKm) : null;
  const dayCount = new Set(mDrives.map(d => kstDateStr(d.start_date))).size;
  const destMap = new Map();
  const SKIP_DESTS = new Set(['집', '회사']);
  for (const d of mDrives) {
    const key = shortAddr(d.end_address) || '?';
    if (SKIP_DESTS.has(key)) continue;
    destMap.set(key, (destMap.get(key) || 0) + 1);
  }
  const topDests = Array.from(destMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const monthLabel = (() => {
    const [y, mm] = monthMode.split('-');
    const cy = new Date().getFullYear();
    return parseInt(y) === cy ? `${parseInt(mm)}월` : `${y}년 ${parseInt(mm)}월`;
  })();

  return (
    <div className="px-4 py-1.5 border-b border-white/[0.06] flex flex-col gap-0.5 flex-shrink-0">
      <p className="text-sm text-zinc-500 tabular-nums flex items-center gap-1.5 flex-wrap">
        <span className="text-zinc-300 font-semibold">{monthLabel}</span>
        <span className="text-zinc-700">·</span>
        <span title="주행" className="inline-flex items-center gap-0.5"><Icon name="car" />{mDrives.length}회</span>
        <span className="text-zinc-700">·</span>
        <span title="운행일" className="inline-flex items-center gap-0.5"><Icon name="calendar" />{dayCount}일</span>
        {totalMin > 0 && (
          <>
            <span className="text-zinc-700">·</span>
            <span title="운전" className="inline-flex items-center gap-0.5"><Icon name="road" />{formatHm(Math.round(totalMin))}</span>
          </>
        )}
      </p>
      <p className="text-xs tabular-nums flex items-center gap-1.5 flex-wrap">
        <span className="font-bold text-blue-400">{totalKm.toFixed(0)}<span className="text-zinc-600 ml-0.5">km</span></span>
        {totalKwh > 0 && (
          <>
            <span className="text-zinc-700">·</span>
            <span className="font-semibold text-green-400">{totalKwh.toFixed(1)}<span className="text-zinc-600 ml-0.5">kWh</span>{usedPct > 0 && <span className="text-zinc-500 ml-1">({usedPct}%)</span>}</span>
          </>
        )}
        {perKm != null && (
          <>
            <span className="text-zinc-700">·</span>
            <span className="text-amber-400">{perKm}<span className="text-zinc-600 ml-0.5">Wh/km</span></span>
          </>
        )}
      </p>
      {topDests.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
          <Icon name="star" className="w-4 h-4 flex-shrink-0 text-amber-400" />
          {topDests.map(([addr, n], i) => (
            <span key={addr} className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 truncate max-w-[140px]">
              <span className="text-zinc-600 mr-1">{i + 1}</span>{addr}<span className="text-zinc-500 ml-1 tabular-nums">{n}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DaySummary({ drives, dayMode }) {
  const dayDrives = drives
    .filter(d => kstDateStr(d.start_date) === dayMode)
    .slice()
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
  if (dayDrives.length === 0) return null;
  const first = dayDrives[0];
  const last = dayDrives[dayDrives.length - 1];
  const totalKm = dayDrives.reduce((s, d) => s + (parseFloat(d.distance) || 0), 0);
  const totalMin = dayDrives.reduce((s, d) => s + (parseFloat(d.duration_min) || 0), 0);
  const totalKwh = dayDrives.reduce((s, d) => {
    if (d.start_rated_range_km && d.end_rated_range_km) {
      const usedKm = parseFloat(d.start_rated_range_km) - parseFloat(d.end_rated_range_km);
      if (usedKm > 0) return s + usedKm * KWH_PER_KM;
    }
    return s;
  }, 0);
  const usedPct = dayDrives.reduce((s, d) => (d.start_battery_level != null && d.end_battery_level != null) ? s + Math.max(0, d.start_battery_level - d.end_battery_level) : s, 0);
  const perKm = totalKm > 0 && totalKwh > 0 ? Math.round((totalKwh * 1000) / totalKm) : null;
  let stayMin = 0;
  for (let i = 1; i < dayDrives.length; i++) {
    const prev = dayDrives[i - 1];
    const cur = dayDrives[i];
    if (prev.end_date && cur.start_date) {
      const gap = (new Date(cur.start_date) - new Date(prev.end_date)) / 60000;
      if (gap > 0) stayMin += gap;
    }
  }
  return (
    <div className="px-4 py-1.5 border-b border-white/[0.06] flex flex-col gap-0.5 flex-shrink-0">
      <p className="text-sm text-zinc-500 tabular-nums flex items-center gap-1.5 flex-wrap">
        <span>{formatTimeRange(first.start_date, last.end_date)}</span>
        <span className="text-zinc-700">·</span>
        <span title="주행" className="inline-flex items-center gap-0.5"><Icon name="car" />{dayDrives.length}회</span>
        {totalMin > 0 && (
          <>
            <span className="text-zinc-700">·</span>
            <span title="운전" className="inline-flex items-center gap-0.5"><Icon name="road" />{formatHm(Math.round(totalMin))}</span>
          </>
        )}
        {stayMin > 0 && (
          <>
            <span className="text-zinc-700">·</span>
            <span title="정차" className="inline-flex items-center gap-0.5"><Icon name="park" />{formatHm(Math.round(stayMin))}</span>
          </>
        )}
      </p>
      <p className="text-sm text-zinc-300 leading-snug truncate">
        {(() => {
          const raw = [first.start_address, ...dayDrives.map(d => d.end_address)].map(a => shortAddr(a) || '?');
          const chain = [];
          for (const addr of raw) { if (chain.length === 0 || chain[chain.length - 1] !== addr) chain.push(addr); }
          return chain.map((addr, i) => <span key={i}>{i > 0 && <span className="text-zinc-600 mx-1">→</span>}{addr}</span>);
        })()}
      </p>
      <p className="text-xs tabular-nums flex items-center gap-1.5 flex-wrap">
        <span className="font-bold text-blue-400">{totalKm.toFixed(1)}<span className="text-zinc-600 ml-0.5">km</span></span>
        {totalKwh > 0 && (
          <>
            <span className="text-zinc-700">·</span>
            <span className="font-semibold text-green-400">{totalKwh.toFixed(1)}<span className="text-zinc-600 ml-0.5">kWh</span>{usedPct > 0 && <span className="text-zinc-500 ml-1">({usedPct}%)</span>}</span>
          </>
        )}
        {perKm != null && (
          <>
            <span className="text-zinc-700">·</span>
            <span className="text-amber-400">{perKm}<span className="text-zinc-600 ml-0.5">Wh/km</span></span>
          </>
        )}
      </p>
    </div>
  );
}

function DriveSummary({ drive }) {
  const sp = drive.start_battery_level ?? null;
  const ep = drive.end_battery_level ?? null;
  const eff = efficiency(drive);
  return (
    <div className="px-4 py-2 border-b border-white/[0.06] flex items-center gap-3 flex-shrink-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-500 tabular-nums">{formatTimeRange(drive.start_date, drive.end_date)} <span className="text-zinc-600">({formatDuration(drive.duration_min)})</span></p>
        <p className="text-sm text-zinc-300 truncate">{shortAddr(drive.start_address) || '출발지'}&nbsp;→&nbsp;{shortAddr(drive.end_address) || '도착지'}</p>
        {sp != null && ep != null && (
          <div className="flex items-center gap-1 mt-0.5 text-xs text-zinc-500 tabular-nums">
            <div className="w-20 h-1.5 bg-zinc-800 rounded-sm overflow-hidden relative">
              <div className="absolute inset-y-0 rounded-sm bg-blue-400/30" style={{ left: `${ep}%`, width: `${sp - ep}%` }} />
              <div className="absolute inset-y-0 rounded-sm bg-green-400/40" style={{ left: 0, width: `${ep}%` }} />
            </div>
            <span>{sp}<span className="text-zinc-600">{'>'}</span>{ep}%</span>
          </div>
        )}
      </div>
      <div className="flex-shrink-0 text-right tabular-nums">
        <p className="text-sm font-bold text-blue-400">{drive.distance}<span className="text-xs text-zinc-600 ml-0.5">km</span></p>
        {eff && <p className="text-sm font-semibold text-green-400">{eff.kwh}<span className="text-xs text-zinc-600 ml-0.5">kWh</span>{sp != null && ep != null && sp > ep && <span className="text-zinc-500 text-xs ml-1">({sp - ep}%)</span>}</p>}
        {eff && <p className="text-xs text-amber-400">{eff.perKm}<span className="text-zinc-600 ml-0.5">Wh/km</span></p>}
      </div>
    </div>
  );
}

function PlaceSummary({ place }) {
  const fmtMD = (s) => { const d = new Date(s); return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
  // 오래 머문 곳 (long-stay) vs 자주 가는 곳 (frequent) — dwell 필드 유무로 분기.
  const isLongStay = place.max_dwell_sec > 0 || place.avg_dwell_sec > 0;
  return (
    <div className="px-4 py-2.5 border-b border-white/[0.06] flex-shrink-0">
      <div className="flex items-center gap-3 mb-2">
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0" />
        <p className="text-base text-zinc-300 truncate flex-1">{place.label}</p>
        {isLongStay ? (
          <span className="text-amber-400 text-sm font-bold tabular-nums flex-shrink-0">
            {formatDwellSec(place.max_dwell_sec)}<span className="text-zinc-500 text-xs ml-1">최장</span>
          </span>
        ) : (
          <span className="text-amber-400 text-sm font-bold tabular-nums flex-shrink-0">{place.visit_count}회 방문</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pl-5 text-xs">
        {isLongStay ? (
          <>
            {place.avg_dwell_sec > 0 && <div className="flex justify-between"><span className="text-zinc-600">평균 체류</span><span className="text-amber-400/80 font-semibold tabular-nums">{formatDwellSec(place.avg_dwell_sec)}</span></div>}
            {place.total_dwell_sec > 0 && <div className="flex justify-between"><span className="text-zinc-600">총 체류</span><span className="text-zinc-400 font-semibold tabular-nums">{formatDwellSec(place.total_dwell_sec)}</span></div>}
            {place.visit_count > 0 && <div className="flex justify-between"><span className="text-zinc-600">방문</span><span className="text-zinc-400 font-semibold tabular-nums">{place.visit_count}회</span></div>}
            {place.last_visit && <div className="flex justify-between"><span className="text-zinc-600">최근 방문</span><span className="text-zinc-400 tabular-nums">{fmtMD(place.last_visit)}</span></div>}
            {place.first_visit && <div className="flex justify-between"><span className="text-zinc-600">첫 방문</span><span className="text-zinc-400 tabular-nums">{fmtMD(place.first_visit)}</span></div>}
          </>
        ) : (
          <>
            {place.first_visit && <div className="flex justify-between"><span className="text-zinc-600">첫 방문</span><span className="text-zinc-400 tabular-nums">{fmtMD(place.first_visit)}</span></div>}
            {place.last_visit && <div className="flex justify-between"><span className="text-zinc-600">최근 방문</span><span className="text-zinc-400 tabular-nums">{fmtMD(place.last_visit)}</span></div>}
            {place.avg_distance > 0 && <div className="flex justify-between"><span className="text-zinc-600">이동 평균</span><span className="text-blue-400/80 font-semibold tabular-nums">{place.avg_distance}km</span></div>}
            {place.avg_duration > 0 && <div className="flex justify-between"><span className="text-zinc-600">소요시간</span><span className="text-zinc-400 font-semibold tabular-nums">{formatDuration(place.avg_duration)}</span></div>}
          </>
        )}
      </div>
      {place.origins?.length > 0 && (
        <div className="flex items-center gap-1 mt-2 pl-5 text-[11px]">
          <span className="text-zinc-600">주요 출발지</span>
          {place.origins.map((o, i) => <span key={i} className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{shortAddr(o.label)}</span>)}
        </div>
      )}
    </div>
  );
}

// 지도 모드 상단 요약 헤더 — month/week/day/drive/place 5-case dispatcher.
export default function MapSummaryHeader({ monthMode, weekMode, dayMode, selectedDrive, selectedPlace, drives }) {
  if (monthMode) return <MonthSummary drives={drives} monthMode={monthMode} />;
  if (weekMode) return <WeekSummary drives={drives} weekMode={weekMode} />;
  if (dayMode) return <DaySummary drives={drives} dayMode={dayMode} />;
  if (selectedDrive) return <DriveSummary drive={selectedDrive} />;
  if (selectedPlace) return <PlaceSummary place={selectedPlace} />;
  return null;
}
