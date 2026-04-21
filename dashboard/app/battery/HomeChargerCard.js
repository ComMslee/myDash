'use client';
import { useState, useEffect, useCallback } from 'react';

const ID_OFFSET = 95110; // chgerId + 95110 = 차지비 앱 ID
// P1 (1순위): 108동 앞 · 107동 앞
const P1_108_IDS = ['04', '05'];                             // 앱 번호 14, 15
const P1_107_IDS = ['12', '13'];                             // 앱 번호 22, 23
// P2 (2순위): 102동 앞 · 104동 앞
const P2_102_IDS = ['06', '07', '08', '09', '10', '11'];     // 앱 번호 16~21
const P2_104_IDS = ['14', '15', '16'];                       // 앱 번호 24, 25, 26

const PRIORITY_IDS = new Set([
  ...P1_108_IDS, ...P1_107_IDS, ...P2_102_IDS, ...P2_104_IDS,
]);

const COMPLEX_NAME = '망포늘푸른벽산아파트';
const STATION_CONFIG = {
  'PI795111': { loc: null,      label: 'PI795111' },
  'PI313299': { loc: '115 B1',  label: '115동 B1' },
  'PIH01089': { loc: '119F',    label: '119동 앞' },
};

const STAT_META = {
  '2': { label: '대기',     dot: 'bg-emerald-500', text: 'text-emerald-400', cellBg: 'bg-emerald-500/80', cellText: 'text-white' },
  '3': { label: '충전중',   dot: 'bg-blue-500',    text: 'text-blue-400',    cellBg: 'bg-blue-500/80',    cellText: 'text-white' },
  '4': { label: '운영중지', dot: 'bg-zinc-600',    text: 'text-zinc-400',    cellBg: 'bg-zinc-700/70',    cellText: 'text-zinc-300' },
  '5': { label: '점검중',   dot: 'bg-amber-500',   text: 'text-amber-400',   cellBg: 'bg-amber-500/80',   cellText: 'text-white' },
  '1': { label: '통신이상', dot: 'bg-rose-500',    text: 'text-rose-400',    cellBg: 'bg-rose-500/80',    cellText: 'text-white' },
  '9': { label: '확인불가', dot: 'bg-zinc-700',    text: 'text-zinc-500',    cellBg: 'bg-zinc-800',       cellText: 'text-zinc-500' },
};

// 상위 25% → 'high', 25~50% → 'mid', 나머지 → null (동점은 같은 등급)
function computeRanks(usage) {
  const entries = Object.entries(usage)
    .map(([id, d]) => ({ id, t: d.t }))
    .filter(e => e.t > 0)
    .sort((a, b) => b.t - a.t);
  if (!entries.length) return new Map();
  const hiIdx = Math.ceil(entries.length * 0.25) - 1;
  const miIdx = Math.ceil(entries.length * 0.50) - 1;
  const hiThreshold = entries[Math.min(hiIdx, entries.length - 1)].t;
  const miThreshold = entries[Math.min(miIdx, entries.length - 1)].t;
  const ranks = new Map();
  for (const e of entries) {
    if (e.t >= hiThreshold) ranks.set(e.id, 'high');
    else if (e.t >= miThreshold) ranks.set(e.id, 'mid');
  }
  return ranks;
}

// 폴링 주기 정보 → 마우스 오버 텍스트
function buildTtlTooltip(ttlInfo) {
  if (!ttlInfo) return '';
  const { dynamic, currentMin, currentHour, schedule } = ttlInfo;
  const lines = [];
  lines.push(`현재 ${currentHour}시 · 갱신 주기 ${currentMin}분`);
  lines.push(dynamic ? '자동 학습 (최근 90일 충전 패턴 기반)' : '기본 스케줄');
  lines.push('');
  // 24시간 스케줄 (6시간씩 4줄)
  for (let block = 0; block < 4; block++) {
    const row = [];
    for (let i = 0; i < 6; i++) {
      const h = block * 6 + i;
      const mark = h === currentHour ? '▶' : ' ';
      row.push(`${mark}${String(h).padStart(2)}시 ${String(schedule[h]).padStart(2)}분`);
    }
    lines.push(row.join('  '));
  }
  return lines.join('\n');
}

function timeAgoKo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 10) return '방금';
  if (s < 60) return `${s}초 전`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

// "YYYYMMDDHHMMSS" (KST) → ms (UTC)
function parseKstDt(s) {
  if (!s || s.length < 14) return null;
  const y = +s.slice(0,4), mo = +s.slice(4,6)-1, d = +s.slice(6,8);
  const h = +s.slice(8,10), mi = +s.slice(10,12), se = +s.slice(12,14);
  if (Number.isNaN(y) || Number.isNaN(mo) || Number.isNaN(d)) return null;
  return Date.UTC(y, mo, d, h - 9, mi, se);
}

function elapsedLabel(c, now) {
  if (c.stat !== '3') return '';
  const startMs = parseKstDt(c.lastTsdt || c.statUpdDt);
  if (!startMs) return '';
  const m = Math.max(0, Math.floor((now - startMs) / 60000));
  if (m < 60) return `${m}m`;
  return `${Math.floor(m/60)}h${String(m%60).padStart(2,'0')}`;
}

// 통일 셀 — 색 배경 + 번호, 하단에 경과 시간(충전중만), 랭크 링
function UnifiedCell({ c, highlight, count, now, size = 'md' }) {
  const meta = STAT_META[c.stat] || STAT_META['9'];
  const localId = ID_OFFSET + Number(c.chgerId);
  const label = localId - 95100;
  const sizeClass = size === 'lg'
    ? 'w-10 h-10 text-sm'
    : 'aspect-square text-[10px]';
  const ringClass = highlight === 'high'
    ? 'ring-1 ring-amber-400'
    : highlight === 'mid'
    ? 'ring-1 ring-amber-400/40'
    : '';
  const elapsed = elapsedLabel(c, now);
  const titleParts = [`${localId} · ${meta.label}`];
  if (elapsed) titleParts.push(`${elapsed} 경과`);
  if (count > 0) titleParts.push(`사용 ${count}회`);
  if (highlight) titleParts.push(highlight === 'high' ? '자주 사용' : '가끔 사용');
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-0">
      <div
        className={`${sizeClass} rounded-md flex items-center justify-center font-bold tabular-nums ${meta.cellBg} ${meta.cellText} ${ringClass}`}
        title={titleParts.join(' · ')}
      >
        {label}
      </div>
      <div className={`text-[9px] tabular-nums leading-none min-h-[10px] ${meta.text}`}>
        {elapsed}
      </div>
    </div>
  );
}

function TileBox({ title, chargers, ranks, usage, statId, now }) {
  if (!chargers.length) return null;
  const keyOf = (c) => `${statId}_${c.chgerId}`;
  return (
    <div className="flex-1 min-w-0 bg-[#1a1a1c] border border-white/[0.06] rounded-lg p-2">
      <div className="text-[10px] text-zinc-400 mb-1.5 font-medium text-center">{title}</div>
      <div className="flex justify-center items-start flex-wrap gap-1.5">
        {chargers.map(c => (
          <UnifiedCell
            key={c.chgerId}
            c={c}
            highlight={ranks.get(keyOf(c)) ?? null}
            count={usage[keyOf(c)]?.t ?? 0}
            now={now}
            size="lg"
          />
        ))}
      </div>
    </div>
  );
}

// 브라우저 세션 동안 유지 — 탭 재진입 시 스피너 없이 즉시 이전 데이터 노출
let moduleCache = null;

export default function HomeChargerCard() {
  const [data, setData] = useState(moduleCache);
  const [loading, setLoading] = useState(!moduleCache);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);
  const [showP3, setShowP3] = useState(false);

  const load = useCallback(async (force = false) => {
    try {
      if (force) setRefreshing(true);
      const res = await fetch(`/api/home-charger${force ? '?refresh=1' : ''}`);
      const d = await res.json();
      if (d.error) setError(d.error);
      else {
        moduleCache = d;
        setData(d);
        setError(null);
      }
    } catch (e) {
      setError(e.message || '조회 실패');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    const poll = setInterval(() => load(false), 60_000);
    const clock = setInterval(() => setTick(t => t + 1), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [load]);

  if (!data) {
    if (loading) {
      return (
        <div className="bg-[#161618] border border-white/[0.06] rounded-2xl flex items-center justify-center py-10">
          <div className="w-5 h-5 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
        </div>
      );
    }
    return (
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-3 text-xs text-zinc-500">
        집충전기 정보를 불러오지 못했습니다{error ? ` — ${error}` : ''}.
      </div>
    );
  }

  const { stations = [], fetchedAt, stale, lastError, ttlInfo } = data;
  const usage = data?.usage || {};
  const ranks = computeRanks(usage);
  const errMsg = error || lastError;
  const allChargers = stations.flatMap(s => s.chargers);
  const counts = allChargers.reduce((acc, c) => {
    acc[c.stat] = (acc[c.stat] || 0) + 1;
    return acc;
  }, {});
  const now = Date.now();
  void tick;

  // 메인 스테이션(PI795111)의 P1/P2 차저 추출
  const mainStation = stations.find(s => s.station.statId === 'PI795111');
  const mainById = new Map((mainStation?.chargers || []).map(c => [c.chgerId, c]));
  const pick = (ids) => ids.map(id => mainById.get(id)).filter(Boolean);
  const cells108 = pick(P1_108_IDS);
  const cells107 = pick(P1_107_IDS);
  const cells102 = pick(P2_102_IDS);
  const cells104 = pick(P2_104_IDS);

  // P3: 메인 스테이션에서 P1/P2 제외 + 나머지 스테이션 전체
  const mainLeftover = (mainStation?.chargers || []).filter(c => !PRIORITY_IDS.has(c.chgerId));
  const refStations = stations.filter(s => s.station.statId !== 'PI795111');
  const p3AllChargers = [
    ...mainLeftover,
    ...refStations.flatMap(s => s.chargers),
  ];
  const p3Counts = p3AllChargers.reduce((acc, c) => {
    acc[c.stat] = (acc[c.stat] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/[0.06] flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums">
        <span className="font-bold tracking-widest uppercase text-zinc-500 shrink-0">집충전기</span>
        <span className="text-zinc-400">총 {allChargers.length}기</span>
        {['2', '3', '5', '1', '4', '9'].map(k => {
          const n = counts[k];
          if (!n) return null;
          const meta = STAT_META[k];
          return (
            <span key={k} className={`flex items-center gap-1 ${meta.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
              {meta.label} {n}
            </span>
          );
        })}
        <span className="ml-auto flex items-center gap-1.5 text-zinc-500">
          {fetchedAt && (
            <span
              className="cursor-help"
              title={ttlInfo ? buildTtlTooltip(ttlInfo) : '갱신 시각'}
            >
              {timeAgoKo(fetchedAt)}
            </span>
          )}
          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
            aria-label="지금 갱신"
            className="w-6 h-6 rounded-md hover:bg-white/[0.06] active:bg-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
          >
            <svg
              viewBox="0 0 20 20"
              className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 10a7 7 0 0 1 12-4.95L17 7" />
              <path d="M17 3v4h-4" />
              <path d="M17 10a7 7 0 0 1-12 4.95L3 13" />
              <path d="M3 17v-4h4" />
            </svg>
          </button>
        </span>
      </div>

      {(errMsg || stale) && (
        <div className="px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-[11px] text-amber-400 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" aria-hidden="true" />
          <span className="break-words">
            {errMsg ? `갱신 실패 — ${errMsg}` : '갱신이 지연되고 있어요 (이전 데이터 표시 중)'}
          </span>
        </div>
      )}

      <div className="px-4 py-3 space-y-3">
        {/* P1: 108동 + 107동 */}
        <div className="flex gap-2">
          <TileBox title="108동" chargers={cells108} ranks={ranks} usage={usage} statId="PI795111" now={now} />
          <TileBox title="107동" chargers={cells107} ranks={ranks} usage={usage} statId="PI795111" now={now} />
        </div>

        {/* P2: 102동 + 104동 */}
        <div className="flex gap-2">
          <TileBox title="102동" chargers={cells102} ranks={ranks} usage={usage} statId="PI795111" now={now} />
          <TileBox title="104동" chargers={cells104} ranks={ranks} usage={usage} statId="PI795111" now={now} />
        </div>

        {/* P3: 참고 (접힘) */}
        {p3AllChargers.length > 0 && (
          <div className="pt-1 border-t border-white/[0.04]">
            <button
              type="button"
              onClick={() => setShowP3(v => !v)}
              className="w-full flex items-center justify-between py-1.5 text-[11px] text-zinc-500 hover:text-zinc-300"
            >
              <span className="flex items-center gap-2">
                <span>참고 {p3AllChargers.length}대</span>
                <span className="text-zinc-600">·</span>
                {['2','3','5','1','4','9'].map(k => {
                  const n = p3Counts[k];
                  if (!n) return null;
                  const meta = STAT_META[k];
                  return (
                    <span key={k} className={`flex items-center gap-1 ${meta.text}`}>
                      <span className={`w-1 h-1 rounded-full ${meta.dot}`} />
                      {meta.label} {n}
                    </span>
                  );
                })}
              </span>
              <span>{showP3 ? '접기 ▲' : '펼치기 ▼'}</span>
            </button>
            {showP3 && (
              <div className="space-y-2 pt-2">
                {mainLeftover.length > 0 && (
                  <div>
                    <div className="text-[10px] text-zinc-500 mb-1">PI795111 · 기타 {mainLeftover.length}대</div>
                    <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(15, minmax(0, 1fr))' }}>
                      {mainLeftover.map(c => (
                        <UnifiedCell
                          key={c.chgerId}
                          c={c}
                          highlight={ranks.get(`PI795111_${c.chgerId}`) ?? null}
                          count={usage[`PI795111_${c.chgerId}`]?.t ?? 0}
                          now={now}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {refStations.map(s => (
                  <div key={s.station.statId}>
                    <div className="text-[10px] text-zinc-500 mb-1">
                      {STATION_CONFIG[s.station.statId]?.label || s.station.statId} · {s.chargers.length}대
                    </div>
                    <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(15, minmax(0, 1fr))' }}>
                      {s.chargers.map(c => (
                        <UnifiedCell
                          key={c.chgerId}
                          c={c}
                          highlight={ranks.get(`${s.station.statId}_${c.chgerId}`) ?? null}
                          count={usage[`${s.station.statId}_${c.chgerId}`]?.t ?? 0}
                          now={now}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
