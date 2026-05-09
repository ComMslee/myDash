'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

function formatDur(min) {
  if (!min) return '0m';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function shortAddr(addr) {
  if (!addr) return '—';
  const m = addr.match(/(\S+(구|군|시))\s+(\S+(동|읍|면|로|길))/);
  if (m) return `${m[1]} ${m[3]}`;
  const parts = addr.split(/[\s,]+/).filter(Boolean);
  return parts.slice(-3).join(' ').slice(0, 24);
}

function relTime(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return '방금';
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

function SocRing({ accent, value, size = 110 }) {
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth="6" fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={accent} strokeWidth="6" fill="none"
        strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        strokeLinecap="round"
      />
      <text x={size / 2} y={size / 2 + 6} textAnchor="middle" fontSize={size / 4} fill="white" fontWeight="bold">
        {value == null ? '—' : value}
      </text>
      <text x={size / 2} y={size / 2 + 22} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.5)">%</text>
    </svg>
  );
}

// 4탭 진입용 큰 타일 (홈 화면 그리드 — 4개 영역)
// value 가 비어있으면 그 자리는   로 채워 grid 높이 통일
function Tile({ href, accent, label, icon, value, sub }) {
  return (
    <Link
      href={href}
      className="block bg-[#161618] border border-white/[0.06] rounded-2xl px-3 py-3.5 hover:bg-white/[0.02] active:bg-white/[0.04] transition-colors"
      style={{ borderTop: `2px solid ${accent}` }}
    >
      <div className="flex items-center gap-2">
        <span className="text-2xl leading-none" aria-hidden>{icon}</span>
        <span className="text-[11px] font-bold tracking-wider uppercase" style={{ color: accent }}>{label}</span>
      </div>
      <div className="mt-2.5 text-[20px] font-bold text-zinc-100 tabular-nums leading-none truncate">
        {value || ' '}
      </div>
      <div className="text-[11px] text-zinc-500 mt-1.5 truncate">{sub}</div>
    </Link>
  );
}

export default function HomePage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    async function fetchData() {
      try {
        const r = await fetch('/api/v2/quick-status', { cache: 'no-store' });
        const j = await r.json();
        if (!alive) return;
        if (j.error) setError(j.error);
        else { setData(j); setError(null); }
      } catch (e) {
        if (alive) setError(e.message || 'fetch 실패');
      }
    }
    fetchData();
    const onVis = () => { if (!document.hidden) fetchData(); };
    document.addEventListener('visibilitychange', onVis);
    const id = setInterval(fetchData, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const drives = data?.drives;
  const history = data?.history;
  const battery = data?.battery;
  const chargers = data?.chargers;
  const lat = history?.latest;

  // SOC 색상 — 헤더 게이지와 통일
  const soc = battery?.soc ?? 0;
  const socColor = soc > 50 ? '#10b981' : soc > 20 ? '#f59e0b' : '#ef4444';

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 py-4 pb-24 space-y-3">
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-[12px] text-rose-300">
            데이터 조회 실패 — {error}
          </div>
        )}

        {/* HERO — 차량 상태 큰 카드 */}
        <Link
          href="/battery#health"
          className="block bg-[#161618] border border-white/[0.06] rounded-2xl p-4 hover:bg-white/[0.02] active:bg-white/[0.04] transition-colors relative overflow-hidden"
        >
          {/* 배경 SOC 게이지 */}
          <div
            className="absolute inset-y-0 left-0 transition-all duration-700 pointer-events-none"
            style={{
              width: `${soc}%`,
              background: `linear-gradient(90deg, ${socColor}26 0%, ${socColor}10 70%, ${socColor}00 100%)`,
            }}
            aria-hidden
          />
          <div className="relative flex items-center gap-4">
            <SocRing accent={socColor} value={battery?.soc} size={104} />
            <div className="flex-1 min-w-0">
              {battery?.charging ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" aria-hidden />
                    <span className="text-[11px] font-bold text-green-400 uppercase tracking-wider">충전 중</span>
                  </div>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-[26px] font-bold text-green-400 tabular-nums leading-none">
                      {battery.charger_power_kw != null ? battery.charger_power_kw.toFixed(1) : '—'}
                    </span>
                    <span className="text-sm text-zinc-400">kW</span>
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1.5">
                    세션 +{(battery.charge_added_kwh || 0).toFixed(1)} kWh
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">현재 배터리</div>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-[26px] font-bold text-zinc-100 tabular-nums leading-none">
                      {battery?.soc ?? '—'}
                    </span>
                    <span className="text-sm text-zinc-400">%</span>
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1.5">
                    {battery?.last_position_at ? `${relTime(battery.last_position_at)} 갱신` : '데이터 없음'}
                  </div>
                </>
              )}
            </div>
          </div>
        </Link>

        {/* 기간별 주행 — 3 col */}
        <Link
          href="/drives"
          className="block bg-[#161618] border border-white/[0.06] rounded-2xl p-3.5 hover:bg-white/[0.02] active:bg-white/[0.04] transition-colors"
        >
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2.5">주행 요약</div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] text-zinc-500">오늘</div>
              <div className="text-[18px] font-bold text-emerald-400 tabular-nums leading-none mt-1">
                {drives ? drives.today_km.toFixed(1) : '—'}<span className="text-[10px] text-zinc-500 ml-0.5">km</span>
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5 truncate">
                {drives?.today_count ? `${drives.today_count}회 · ${formatDur(drives.today_duration_min)}` : '없음'}
              </div>
            </div>
            <div className="border-l border-white/[0.06] pl-3">
              <div className="text-[10px] text-zinc-500">이번 주</div>
              <div className="text-[18px] font-bold text-emerald-400 tabular-nums leading-none mt-1">
                {history?.week_count ?? 0}<span className="text-[10px] text-zinc-500 ml-0.5">건</span>
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5 truncate tabular-nums">
                {(history?.week_km ?? 0).toFixed(1)} km
              </div>
            </div>
            <div className="border-l border-white/[0.06] pl-3">
              <div className="text-[10px] text-zinc-500">최근 주행</div>
              <div className="text-[18px] font-bold text-violet-400 tabular-nums leading-none mt-1">
                {lat ? lat.distance.toFixed(0) : '—'}<span className="text-[10px] text-zinc-500 ml-0.5">km</span>
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5 truncate">
                {lat ? relTime(lat.start) : ''}
              </div>
            </div>
          </div>
        </Link>

        {/* 최근 주행 (이력) */}
        {lat && (
          <Link
            href="/history"
            className="block bg-[#161618] border border-white/[0.06] rounded-2xl p-3.5 hover:bg-white/[0.02] active:bg-white/[0.04] transition-colors"
            style={{ borderLeft: '2px solid #a78bfa' }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold text-violet-400 uppercase tracking-wider flex items-center gap-1.5">
                  🗺️ 최근 주행
                </div>
                <div className="text-[15px] font-bold text-zinc-100 mt-1 truncate">
                  {shortAddr(lat.start_addr)} → {shortAddr(lat.end_addr)}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1 tabular-nums">
                  {lat.distance.toFixed(1)}km · {formatDur(lat.duration_min)} · {relTime(lat.start)}
                </div>
              </div>
              <span className="text-zinc-600 text-base shrink-0">›</span>
            </div>
          </Link>
        )}

        {/* 4탭 타일 그리드 — 깊은 진입용 (집 충전소 카드는 폴링 진단 정보 위주라 제거) */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <Tile
            href="/drives"
            accent="#34d399"
            label="주행"
            icon="🚗"
            value={drives ? `${drives.today_km.toFixed(1)} km` : '—'}
            sub="KPI · 인사이트 · TOP 50"
          />
          <Tile
            href="/history"
            accent="#a78bfa"
            label="이력"
            icon="🗺️"
            value={history?.week_count ? `${history.week_count}건` : '—'}
            sub="일자별 · 지도 · 자주 가는 곳"
          />
          <Tile
            href="/battery"
            accent="#60a5fa"
            label="배터리"
            icon="🔋"
            value={battery?.soc != null ? `${battery.soc}%` : '—'}
            sub="건강도 · 대기 소모 · 충전 기록"
          />
          <Tile
            href="/chargers"
            accent="#fbbf24"
            label="집 충전소"
            icon="⚡"
            // 폴링 % 는 진단 정보 — 사용자 시야 X. 사용량 stats_count 도 cache 미스 시 0 으로 떠 신뢰성 낮음.
            // value 비움 + sub 만으로 진입 카드 역할.
            value=""
            sub="실시간 + 통계 + 리포트"
          />
        </div>

        {/* 부가 sub-page 진입 (폴링 로그 칩은 진단 정보라 home 노출 X — /chargers/poll-log URL 직접) */}
        <div className="flex flex-wrap gap-1.5 pt-2">
          <Link
            href="/chargers/report"
            className="text-[11px] px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 border border-white/[0.06] transition-colors"
          >
            📊 활용도 리포트
          </Link>
        </div>
      </div>
    </main>
  );
}
