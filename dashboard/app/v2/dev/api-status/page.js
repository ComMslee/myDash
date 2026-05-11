'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RenderErrorBoundary } from './_components/RenderErrorBoundary';
import { RouteRow } from './_components/RouteRow';
import { ServerStatusCard } from './_components/ServerStatusCard';

// ── 라우트 메타데이터 ─────────────────────────────────────────
// dashboard: 펼침 시 raw peek 위에 추가로 보여줄 대시보드 ('server' | 'charging' | 'poll')
// params[].sample 의 'auto:firstDriveId' 는 마운트 시 /api/drives 응답에서 자동 픽
// /api/server-status 는 ROUTES 에서 제외 — 상단 항상-표시 카드(`서버` 섹션)
// 가 동일 엔드포인트를 30초 자동 갱신해 그림. 카테고리 행으로 또 두면 중복.
const ROUTES = [
  // 차량
  { path: '/api/car',              label: '차량',           desc: '현재 상태(주차/주행/충전) + SOC·범위·위치 + 추천 충전일', category: '차량' },
  { path: '/api/drives',           label: '주행 요약',      desc: '최근 주행 목록 + 거리/시간/효율 (from·to 로 기간 필터)', category: '차량',
    params: [
      { key: 'from', sample: '' },
      { key: 'to',   sample: '' },
    ] },
  { path: '/api/insights',         label: '인사이트',       desc: '누적 거리·kWh·평균효율·요약 통계', category: '차량' },
  { path: '/api/summary',          label: '일자 요약',      desc: 'drives+charges 집계 + 전비(eff_wh_km). range=today|yesterday|week|this-week|last-week|month|last-month|multi — 봇 /period', category: '차량',
    params: [{ key: 'range', sample: 'multi' }] },
  { path: '/api/home-charger/groups', label: '충전기 그룹',  desc: '동별 그룹 카운트 (구성 = constants.js) — 봇 /chargers', category: '집충전기' },
  { path: '/api/home-charger/report', label: '활용도 리포트', desc: '월별 점유율·시간대×요일 히트맵·KPI — /v2/chargers/report 페이지', category: '집충전기',
    dashboard: 'report' },
  { path: '/api/parked',           label: '주차 정보',      desc: '마지막 종료 drive 위치·경과 (driving=true 면 진행 중) — 봇 /where 의 정차/주행 분기에 사용', category: '차량' },
  { path: '/api/location',         label: '현재 좌표',      desc: '최신 positions 의 lat/lng/date — 봇 /where 공용', category: '차량' },

  // 주행
  { path: '/api/route-map',        label: '경로 지도',      desc: '단일 주행의 polyline + start/end + 통계 (driveId 필수)', category: '주행',
    params: [
      { key: 'driveId', required: true, sample: 'auto:firstDriveId' },
      { key: 'detail',  sample: '' },
    ] },
  { path: '/api/heatmap',          label: '히트맵',         desc: '전체 위치 좌표 다운샘플링 → 빈도 히트맵 입력', category: '주행' },
  { path: '/api/year-heatmap',     label: '연간 히트맵',    desc: '최근 1년 일별 주행/충전 집계 (캘린더 셀)', category: '주행' },
  { path: '/api/monthly-history',  label: '월간 이력',      desc: '월별 주행거리/충전량/효율 집계', category: '주행' },
  { path: '/api/frequent-places',  label: '자주 가는 곳',   desc: '지오펜스 도착 빈도 + 카카오 reverse geocode (집/회사 우선 핀)', category: '주행' },
  { path: '/api/resolve-address',  label: '좌표→주소',      desc: 'lat/lng → 한국어 라벨 (Kakao 역지오코딩, DB 캐시) — 봇 알림 주소 폴백', category: '주행',
    params: [
      { key: 'lat', required: true, sample: '37.5665' },
      { key: 'lng', required: true, sample: '126.9780' },
    ] },
  { path: '/api/long-stay-places', label: '오래 머문 곳',   desc: '체류 시간(다음 주행 시작-종료 갭) 누적 — 10분 미만 노이즈 필터', category: '주행' },
  { path: '/api/rankings',         label: '랭킹',           desc: '주행/일자별 TOP N (type=거리·시간·평속·효율)', category: '주행',
    params: [
      { key: 'type',  sample: 'drive_distance' },
      { key: 'limit', sample: '30' },
    ] },

  // 배터리
  { path: '/api/battery',          label: '배터리',         desc: 'SOC 종합 — 용량·체류 분포·주간/월간 충방전·추정 잔여', category: '배터리' },
  { path: '/api/battery-trend',    label: '배터리 추이',    desc: 'SOC 시계열 (라인 차트용 다운샘플링)', category: '배터리' },
  { path: '/api/charges',          label: '충전 기록',      desc: '최근 충전 세션 목록 (시작 SOC → 종료 SOC, kWh, 위치)', category: '배터리' },
  { path: '/api/charge-all-time',  label: '충전 전기간',    desc: '전기간 누적 충전 통계 (총 kWh, 횟수, 평균)', category: '배터리' },
  { path: '/api/charging-status',  label: '충전 상태',      desc: '현재 충전 중 여부 + power/level 신호 + 폴백 진단', category: '배터리', dashboard: 'charging' },
  { path: '/api/fast-charges',     label: '급속 기록',      desc: 'DC 급속(>50kW) 충전 세션 필터', category: '배터리' },
  { path: '/api/slow-charges',     label: '완속 기록',      desc: 'AC 완속 충전 세션 필터', category: '배터리' },
  { path: '/api/debug/charging',   label: '디버그 · 충전',  desc: '충전 감지 raw 신호 (positions.power, charges 행, states)', category: '배터리' },

  // 집충전기
  { path: '/api/home-charger',                  label: '집충전기',         desc: '환경공단 API 사용량 (캐시 우선, refresh=1로 강제 갱신)', category: '집충전기',
    params: [{ key: 'refresh', sample: '' }] },
  { path: '/api/home-charger/fleet-stats',      label: '집충전기 누적',    desc: '등록된 모든 집충전기 월별 누적 (months 로 기간)', category: '집충전기',
    params: [{ key: 'months', sample: '' }] },
  { path: '/api/home-charger/poll-log',         label: '집충전기 로그',    desc: '폴링 루프 로그 + warm 진단 (view=hourly/daily/raw)', category: '집충전기', dashboard: 'poll',
    params: [
      { key: 'view', sample: 'hourly' },
      { key: 'days', sample: '' },
      { key: 'date', sample: '' },
    ] },
  { path: '/api/find-nearby-chargers',          label: '주변 충전소',      desc: '좌표/주소 기반 주변 충전소 탐색 (1회성 조사)', category: '집충전기',
    params: [
      { key: 'radius', sample: '' },
      { key: 'count',  sample: '' },
      { key: 'addr',   sample: '' },
      { key: 'name',   sample: '' },
    ] },

  // 가족
  { path: '/api/family/festivals', label: '축제',           desc: '한국관광공사 TourAPI(searchFestival2) 래핑 — 봇 /festivals (가족)', category: '가족',
    params: [
      { key: 'from',     sample: '' },
      { key: 'to',       sample: '' },
      { key: 'areaCode', sample: '' },
      { key: 'size',     sample: '' },
    ] },

  // Spotify (env: SPOTIFY_CLIENT_ID/SECRET/REFRESH_TOKEN — scripts/spotify-bootstrap.mjs 1회 발급)
  { path: '/api/spotify/now-playing', label: '재생 중',     desc: '/me/player — 현재 곡·진행률·디바이스 (차량 자동 감지)', category: 'Spotify' },
  { path: '/api/spotify/devices',     label: '디바이스',    desc: '/me/player/devices — 활성 디바이스 목록 (Tesla=isVehicle)', category: 'Spotify' },
  { path: '/api/spotify/recent',      label: '최근 재생',   desc: 'recently-played 최대 50곡 + 즐겨찾기 batch', category: 'Spotify',
    params: [{ key: 'limit', sample: '10' }] },
  { path: '/api/spotify/queue',       label: '대기열',      desc: '/me/player/queue — 다음 재생 예정 트랙', category: 'Spotify' },
  { path: '/api/spotify/during-drive', label: '운전 매시업', desc: 'drives [start, end] × Spotify recently-played 시간 교집합 (50곡 캡)', category: 'Spotify',
    params: [
      { key: 'start', required: true, sample: '' },
      { key: 'end',   required: true, sample: '' },
    ] },
  // POST 라우트 (api-status GET 으로 헬스체크 불가 — 참고 표시만)
  { path: '/api/spotify/control',     label: '제어 (POST)',  desc: 'play|pause|next|previous — Premium 한정', category: 'Spotify', method: 'POST' },
  { path: '/api/spotify/seek',        label: '시크 (POST)',  desc: 'positionMs 로 진행률 이동', category: 'Spotify', method: 'POST' },
  { path: '/api/spotify/favorite',    label: '좋아요 (POST)', desc: 'trackId 즐겨찾기 토글', category: 'Spotify', method: 'POST' },
  { path: '/api/spotify/play-track',  label: '재생 (POST)',  desc: 'spotify:track:* URI 즉시 재생', category: 'Spotify', method: 'POST' },
];

const CATEGORIES = ['차량', '주행', '배터리', '집충전기', '가족', 'Spotify'];

const SLOW_MS = 1500;

function buildQS(params, values) {
  if (!params?.length) return '';
  const usp = new URLSearchParams();
  for (const p of params) {
    const v = values?.[p.key];
    if (v != null && v !== '') usp.set(p.key, v);
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

function summarizePayload(text) {
  if (!text) return { kind: 'empty', hint: '—', peek: '', parsed: null };
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    return { kind: 'text', hint: `${text.length}자`, peek: text.slice(0, 500), parsed: null };
  }
  let hint = '';
  if (Array.isArray(parsed)) {
    hint = `${parsed.length}행`;
  } else if (parsed && typeof parsed === 'object') {
    const keys = Object.keys(parsed);
    if ('error' in parsed) hint = `error: ${String(parsed.error).slice(0, 40)}`;
    else hint = `${keys.length}키`;
  } else {
    hint = String(parsed).slice(0, 30);
  }
  let peek;
  try { peek = JSON.stringify(parsed, null, 2).slice(0, 800); }
  catch { peek = text.slice(0, 800); }
  return { kind: 'json', hint, peek, parsed };
}

export default function ApiStatusPage() {
  const [results, setResults] = useState({});
  const [paramValues, setParamValues] = useState({});
  const [expanded, setExpanded] = useState({});
  const [editing, setEditing] = useState({});
  const [autoDriveId, setAutoDriveId] = useState(null);
  const [autoErr, setAutoErr] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [serverData, setServerData] = useState(null);
  const [serverLatency, setServerLatency] = useState(null);
  const [serverErr, setServerErr] = useState(null);
  const runIdRef = useRef(0);
  const [tab, setTab] = useState('server');

  // 서버 상태 — 페이지 진입 시 즉시 + 30초 주기 자동 갱신.
  // history 는 서버측 ring buffer(/api/server-status 응답.history) 를 그대로 사용.
  // → 새로고침해도 트렌드 유지, 앱 재시작 시 리셋.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const t0 = performance.now();
      try {
        const res = await fetch('/api/server-status', { cache: 'no-store' });
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch {}
        if (!alive) return;
        if (!res.ok) {
          setServerErr(data?.error || `HTTP ${res.status}`);
        } else {
          setServerData(data);
          setServerLatency(performance.now() - t0);
          setServerErr(null);
        }
      } catch (e) {
        if (alive) setServerErr(e?.message || 'fetch 실패');
      }
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // 마운트 시 driveId 자동 픽
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/drives');
        const d = await res.json();
        if (!alive) return;
        const id = d?.recent_drives?.[0]?.id;
        if (id != null) setAutoDriveId(String(id));
        else setAutoErr('recent_drives 비어 있음');
      } catch (e) {
        if (alive) setAutoErr(e.message || '조회 실패');
      }
    })();
    return () => { alive = false; };
  }, []);

  // 사용자 편집 보존하며 sample 채우기
  useEffect(() => {
    setParamValues(prev => {
      const next = { ...prev };
      for (const r of ROUTES) {
        if (!r.params) continue;
        const merged = { ...(next[r.path] || {}) };
        for (const p of r.params) {
          if (p.sample === 'auto:firstDriveId') {
            if (!merged[p.key] && autoDriveId) merged[p.key] = autoDriveId;
            else if (merged[p.key] == null) merged[p.key] = '';
          } else if (merged[p.key] == null) {
            merged[p.key] = p.sample || '';
          }
        }
        next[r.path] = merged;
      }
      return next;
    });
  }, [autoDriveId]);

  const counts = useMemo(() => {
    const c = { ok: 0, slow: 0, fail: 0, idle: 0, running: 0 };
    for (const r of ROUTES) {
      const s = results[r.path]?.state || 'idle';
      c[s] = (c[s] || 0) + 1;
    }
    return c;
  }, [results]);

  async function runOne(route) {
    const myRun = ++runIdRef.current;
    setResults(prev => ({ ...prev, [route.path]: { state: 'running' } }));

    const qs = buildQS(route.params, paramValues[route.path]);
    const url = route.path + qs;
    const t0 = performance.now();
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const text = await res.text();
      const dt = performance.now() - t0;
      const sum = summarizePayload(text);
      const ok = res.ok && !(sum.parsed && typeof sum.parsed === 'object' && 'error' in sum.parsed);
      const state = !ok ? 'fail' : (dt >= SLOW_MS ? 'slow' : 'ok');
      const result = {
        state,
        status: res.status,
        ms: dt,
        bytes: text.length,
        url,
        hint: sum.hint,
        peek: sum.peek,
        parsed: sum.parsed,
      };
      setResults(prev => prev[route.path]?.runId && prev[route.path].runId > myRun ? prev : { ...prev, [route.path]: { ...result, runId: myRun } });
    } catch (e) {
      const dt = performance.now() - t0;
      setResults(prev => ({
        ...prev,
        [route.path]: {
          state: 'fail',
          status: null,
          ms: dt,
          bytes: null,
          url,
          hint: 'fetch 실패',
          peek: String(e?.message || e).slice(0, 800),
          parsed: null,
          runId: myRun,
        },
      }));
    }
  }

  async function runAll() {
    setLastRun(Date.now());
    await Promise.allSettled(ROUTES.map(r => runOne(r)));
  }

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 py-5 pb-8 flex flex-col gap-4">

        {/* Tab bar */}
        <div className="flex gap-1 bg-[#161618] border border-white/[0.06] rounded-2xl p-1">
          <button
            onClick={() => setTab('server')}
            className={`flex-1 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-colors ${
              tab === 'server' ? 'bg-white/[0.06] text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            서버
            {serverErr && <span className="ml-1.5 text-rose-400">⚠</span>}
          </button>
          <button
            onClick={() => setTab('api')}
            className={`flex-1 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-colors ${
              tab === 'api' ? 'bg-white/[0.06] text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            API 테스트
            {counts.fail > 0 && <span className="ml-1.5 text-rose-400 text-[11px] tabular-nums">✕{counts.fail}</span>}
            {counts.fail === 0 && counts.slow > 0 && <span className="ml-1.5 text-amber-400 text-[11px] tabular-nums">⚠{counts.slow}</span>}
          </button>
        </div>

        {/* Hero — API 탭 */}
        {tab === 'api' && (() => {
          const overall =
            counts.fail > 0 ? 'fail'
            : counts.slow > 0 ? 'slow'
            : counts.running > 0 ? 'running'
            : counts.idle === ROUTES.length ? 'idle'
            : counts.idle > 0 ? 'partial'
            : 'ok';
          const cfg = {
            ok:      { label: '정상',   dot: 'bg-emerald-400', halo: 'bg-emerald-500/15', pulse: true },
            slow:    { label: '느림',   dot: 'bg-amber-400',   halo: 'bg-amber-500/15',   pulse: false },
            fail:    { label: '오류',   dot: 'bg-rose-400',    halo: 'bg-rose-500/15',    pulse: false },
            running: { label: '실행 중', dot: 'bg-blue-400',    halo: 'bg-blue-500/15',    pulse: true },
            partial: { label: '부분',   dot: 'bg-zinc-400',    halo: 'bg-zinc-500/15',    pulse: false },
            idle:    { label: '대기',   dot: 'bg-zinc-600',    halo: 'bg-zinc-700/30',    pulse: false },
          }[overall];
          return (
            <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
                    <span className={`absolute inset-0 rounded-full ${cfg.halo} ${cfg.pulse ? 'animate-pulse' : ''}`} />
                    <span className={`relative w-3 h-3 rounded-full ${cfg.dot}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl font-light tracking-tight">{cfg.label}</div>
                    <div className="text-[11px] text-zinc-500 tabular-nums mt-0.5">
                      <span className="text-zinc-300">{counts.ok}</span>
                      <span className="text-zinc-600"> / {ROUTES.length} OK</span>
                      {counts.slow > 0 && <span className="ml-2.5 text-amber-400">⚠ {counts.slow}</span>}
                      {counts.fail > 0 && <span className="ml-2.5 text-rose-400">✕ {counts.fail}</span>}
                      {counts.idle > 0 && counts.idle < ROUTES.length && <span className="ml-2.5 text-zinc-600">○ {counts.idle}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <button
                    onClick={runAll}
                    className="px-3 py-1.5 rounded-full bg-white/[0.05] hover:bg-white/[0.08] active:bg-white/[0.10] text-zinc-300 text-[11px] font-medium flex items-center gap-1.5"
                  >
                    <span className="text-[13px]">↻</span>
                    <span>재실행</span>
                  </button>
                  <span className="text-[10px] text-zinc-600 tabular-nums">
                    {lastRun ? new Date(lastRun).toLocaleTimeString('ko-KR', { hour12: false }) : '미실행'}
                  </span>
                </div>
              </div>

              {/* 진행 바 — OK / slow / fail / idle 비율 */}
              <div className="mt-4 h-1 rounded-full bg-white/[0.04] overflow-hidden flex">
                {counts.ok   > 0 && <div className="h-full bg-emerald-500/70" style={{ width: `${(counts.ok   / ROUTES.length) * 100}%` }} />}
                {counts.slow > 0 && <div className="h-full bg-amber-500/70"   style={{ width: `${(counts.slow / ROUTES.length) * 100}%` }} />}
                {counts.fail > 0 && <div className="h-full bg-rose-500/70"    style={{ width: `${(counts.fail / ROUTES.length) * 100}%` }} />}
              </div>

              {autoErr && (
                <div className="mt-3 text-[10px] text-zinc-600">
                  driveId: <span className="text-rose-400">{autoErr}</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* 서버 탭 */}
        {tab === 'server' && (
          <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-3">
            {serverData ? (
              <RenderErrorBoundary>
                <ServerStatusCard data={serverData} latencyMs={serverLatency} history={serverData.history || []} />
              </RenderErrorBoundary>
            ) : serverErr ? (
              <div className="text-[11px] text-rose-300">로딩 실패 — {serverErr}</div>
            ) : (
              <div className="text-[11px] text-zinc-500">로딩 중…</div>
            )}
          </div>
        )}

        {/* 카테고리별 — API 탭 */}
        {tab === 'api' && CATEGORIES.map(cat => {
          const list = ROUTES.filter(r => r.category === cat);
          return (
            <div key={cat} className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
              <div className="px-4 py-2 border-b border-white/[0.06]">
                <span className="text-[11px] font-bold tracking-widest uppercase text-zinc-500">{cat}</span>
              </div>
              <div>
                {list.map(route => (
                  <RouteRow
                    key={route.path}
                    route={route}
                    result={results[route.path]}
                    values={paramValues[route.path] || {}}
                    setValue={(k, v) => setParamValues(prev => ({ ...prev, [route.path]: { ...(prev[route.path] || {}), [k]: v } }))}
                    expanded={!!expanded[route.path]}
                    onToggleExpand={() => setExpanded(prev => ({ ...prev, [route.path]: !prev[route.path] }))}
                    editing={!!editing[route.path]}
                    onToggleEdit={() => setEditing(prev => ({ ...prev, [route.path]: !prev[route.path] }))}
                    onRun={() => runOne(route)}
                  />
                ))}
              </div>
            </div>
          );
        })}

      </div>
    </main>
  );
}
