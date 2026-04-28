'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  MAIN_STATION_ID, POLL_INTERVAL_MS, CLOCK_INTERVAL_MS,
  P1_108_IDS, P1_107_IDS, P2_102_IDS, P2_104_IDS,
  PRIORITY_IDS, P3_GROUPS, P3_GROUPED_IDS, P3_115_IDS,
  STATION_115_UNDERGROUND, STATION_CONFIG,
} from './home-charger/constants';
import { computeRanks, buildTtlTooltip, timeAgoKo } from './home-charger/utils';
import { TileBox, StatusBadges, UnifiedCell } from './home-charger/ChargerTile';
import PollLogPopup from './home-charger/PollLogPopup';

// 브라우저 세션 동안 유지 — 탭 재진입 시 스피너 없이 즉시 이전 데이터 노출
let moduleCache = null;

// 상태별 카운트 집계
function countByStat(chargers) {
  return chargers.reduce((acc, c) => {
    acc[c.stat] = (acc[c.stat] || 0) + 1;
    return acc;
  }, {});
}

export default function HomeChargerCard({ showFavLabel = false } = {}) {
  const [data, setData] = useState(moduleCache);
  const [loading, setLoading] = useState(!moduleCache);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);
  const [showP3, setShowP3] = useState(false);
  const [showPollLog, setShowPollLog] = useState(false);

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
    const poll = setInterval(() => load(false), POLL_INTERVAL_MS);
    const clock = setInterval(() => setTick(t => t + 1), CLOCK_INTERVAL_MS);
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
  const counts = countByStat(allChargers);
  const now = Date.now();
  void tick;

  // 메인 스테이션의 P1/P2 차저 추출
  const mainStation = stations.find(s => s.station.statId === MAIN_STATION_ID);
  const mainById = new Map((mainStation?.chargers || []).map(c => [c.chgerId, c]));
  const pick = (ids) => ids.map(id => mainById.get(id)).filter(Boolean);
  const cells108 = pick(P1_108_IDS);
  const cells107 = pick(P1_107_IDS);
  const cells102 = pick(P2_102_IDS);
  const cells104 = pick(P2_104_IDS);

  // P3: 메인 스테이션에서 P1/P2 제외 + 나머지 스테이션 전체
  const mainRest = (mainStation?.chargers || []).filter(c => !PRIORITY_IDS.has(c.chgerId));
  // P3 단일-스테이션 그룹(105동 등) 분리
  const p3GroupCells = P3_GROUPS.map(g => ({
    title: g.title,
    chargers: mainRest.filter(c => g.ids.includes(c.chgerId)),
  })).filter(g => g.chargers.length > 0);
  // 115동 합성 타일 — 지상(PI795111) + 지하(PI313299)
  const cells115Ground = mainRest.filter(c => P3_115_IDS.includes(c.chgerId));
  const underStation = stations.find(s => s.station.statId === STATION_115_UNDERGROUND);
  const cells115Under = underStation?.chargers || [];
  const show115 = cells115Ground.length + cells115Under.length > 0;
  // mainLeftover: 105동/115동 지상 제외 나머지
  const mainLeftover = mainRest.filter(c => !P3_GROUPED_IDS.has(c.chgerId));
  // refStations: 115동 지하는 별도 115동 타일에서 렌더하므로 제외
  const refStations = stations.filter(s =>
    s.station.statId !== MAIN_STATION_ID &&
    s.station.statId !== STATION_115_UNDERGROUND
  );
  // 102/104 가 P1 즐겨찾기로 격상 — P3 카운트에서 제외
  const p3AllChargers = [
    ...mainRest,
    ...cells115Under,
    ...refStations.flatMap(s => s.chargers),
  ];
  const p3Counts = countByStat(p3AllChargers);

  const tileProps = { ranks, usage, statId: MAIN_STATION_ID, now };

  return (
    <>
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/[0.06] flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums">
        <span className="font-bold tracking-widest uppercase text-zinc-500 shrink-0">집충전기</span>
        <span className="text-zinc-400">총 {allChargers.length}기</span>
        <StatusBadges counts={counts} />
        <span className="ml-auto flex items-center gap-1.5 text-zinc-500">
          <button
            type="button"
            onClick={() => setShowPollLog(true)}
            aria-label="폴링 로그"
            title="폴링 로그"
            className="h-7 px-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] flex items-center gap-1 text-zinc-400 hover:text-zinc-200 text-[10px] font-medium"
          >
            로그
          </button>
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
        {/* P1 즐겨찾기: 108·107(1행) + 102·104(2행) — 카드 헤더에 동번호 표시되므로 라벨에선 제거 */}
        <div className="space-y-1.5">
          {showFavLabel && (
            <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
              <span>⭐ 즐겨찾기</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            <TileBox title="108" chargers={cells108} variant="favorite" {...tileProps} />
            <TileBox title="107" chargers={cells107} variant="favorite" {...tileProps} />
            <TileBox title="102" chargers={cells102} variant="favorite" {...tileProps} />
            <TileBox title="104" chargers={cells104} variant="favorite" {...tileProps} />
          </div>
        </div>

        {/* 더보기 (접힘) — 105 → 115 → 111 → 117 → 인근 (모두 단일 컬럼) */}
        {p3AllChargers.length > 0 && (
          <div className="pt-1 border-t border-white/[0.04]">
            <button
              type="button"
              onClick={() => setShowP3(v => !v)}
              className="w-full flex items-center justify-between py-1.5 text-[11px] text-zinc-500 hover:text-zinc-300"
            >
              <span className="flex items-center gap-2">
                <span>{showFavLabel ? '그 외' : '더보기'} {p3AllChargers.length}대</span>
                <span className="text-zinc-600">·</span>
                <StatusBadges counts={p3Counts} size="sm" />
              </span>
              <span>{showP3 ? '접기 ▲' : '펼치기 ▼'}</span>
            </button>
            {showP3 && (
              <div className="grid grid-cols-2 gap-1.5 pt-2">
                {(() => {
                  const g105 = p3GroupCells.find(g => g.title === '105');
                  return g105 ? <TileBox title="105" chargers={g105.chargers} {...tileProps} /> : null;
                })()}
                {show115 && (
                  <div className="bg-[#1c1d20] border border-white/[0.06] rounded-2xl p-3">
                    <div className="text-[11px] text-zinc-400 font-semibold mb-2 px-0.5 tabular-nums">
                      115
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {cells115Ground.map(c => {
                        const k = `${MAIN_STATION_ID}_${c.chgerId}`;
                        const u = usage[k];
                        return (
                          <UnifiedCell
                            key={`g-${c.chgerId}`}
                            c={c}
                            highlight={ranks.get(k) ?? null}
                            count={u?.t ?? 0}
                            hourly={u?.h ?? null}
                            now={now}
                          />
                        );
                      })}
                      {cells115Under.map(c => {
                        const k = `${STATION_115_UNDERGROUND}_${c.chgerId}`;
                        const u = usage[k];
                        return (
                          <UnifiedCell
                            key={`u-${c.chgerId}`}
                            c={c}
                            highlight={ranks.get(k) ?? null}
                            count={u?.t ?? 0}
                            hourly={u?.h ?? null}
                            now={now}
                            numberPrefix="B-"
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
                {(() => {
                  const g111 = p3GroupCells.find(g => g.title === '111');
                  return g111 ? <TileBox title="111" chargers={g111.chargers} {...tileProps} /> : null;
                })()}
                {(() => {
                  const g117 = p3GroupCells.find(g => g.title === '117');
                  return g117 ? <TileBox title="117" chargers={g117.chargers} {...tileProps} /> : null;
                })()}
                {refStations.map(s => {
                  const stationTitle = (STATION_CONFIG[s.station.statId]?.label || s.station.statId).replace(/\s*앞$/, '');
                  return (
                    <TileBox
                      key={s.station.statId}
                      title={stationTitle}
                      chargers={s.chargers}
                      ranks={ranks}
                      usage={usage}
                      statId={s.station.statId}
                      now={now}
                      variant="nearby"
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    {showPollLog && <PollLogPopup onClose={() => setShowPollLog(false)} />}
    </>
  );
}
