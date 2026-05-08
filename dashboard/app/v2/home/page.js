'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const KST = 9 * 3600 * 1000;

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

function SocRing({ accent, value, size = 64 }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth="4" fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={accent} strokeWidth="4" fill="none"
        strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        strokeLinecap="round"
      />
      <text x={size / 2} y={size / 2 + 4} textAnchor="middle" fontSize="14" fill="white" fontWeight="bold">
        {value == null ? '—' : value}
      </text>
      <text x={size / 2} y={size / 2 + 14} textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.5)">%</text>
    </svg>
  );
}

function Card({ href, accent, label, headline, sub, right }) {
  return (
    <Link
      href={href}
      className="block bg-[#161618] border border-white/[0.06] rounded-2xl p-4 hover:bg-white/[0.02] active:bg-white/[0.04] transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="text-[10px] font-bold tracking-widest uppercase"
            style={{ color: accent }}
          >
            {label}
          </div>
          <div className="text-[18px] font-bold text-zinc-100 mt-1 leading-tight truncate">
            {headline}
          </div>
          {sub && (
            <div className="text-[11px] text-zinc-500 mt-1 truncate tabular-nums">
              {sub}
            </div>
          )}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
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

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 py-5 pb-24 space-y-3">
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-[12px] text-rose-300">
            데이터 조회 실패 — {error}
          </div>
        )}

        {/* 주행 */}
        <Card
          href="/drives"
          accent="#34d399"
          label="오늘 주행"
          headline={drives ? `${drives.today_km.toFixed(1)} km` : '—'}
          sub={
            drives?.today_count
              ? `${drives.today_count}회 · ${formatDur(drives.today_duration_min)}`
              : '오늘 주행 없음'
          }
        />

        {/* 이력 */}
        <Card
          href="/history"
          accent="#a78bfa"
          label="최근 주행"
          headline={lat ? `${shortAddr(lat.start_addr)} → ${shortAddr(lat.end_addr)}` : '—'}
          sub={
            lat
              ? `${lat.distance.toFixed(1)}km · ${formatDur(lat.duration_min)} · ${relTime(lat.start)}${
                  history?.week_count != null ? ` · 이번 주 ${history.week_count}건` : ''
                }`
              : '이력 없음'
          }
        />

        {/* 배터리 */}
        <Card
          href="/battery"
          accent="#60a5fa"
          label="배터리"
          headline={
            battery?.charging
              ? `⚡ ${battery.charger_power_kw != null ? battery.charger_power_kw.toFixed(1) : '—'} kW`
              : battery?.soc != null ? `${battery.soc} %` : '—'
          }
          sub={
            battery?.charging
              ? `현재 ${battery.soc ?? '—'}% · 세션 +${(battery.charge_added_kwh || 0).toFixed(1)} kWh`
              : battery?.last_position_at
                ? `${relTime(battery.last_position_at)} 갱신`
                : '데이터 없음'
          }
          right={<SocRing accent="#60a5fa" value={battery?.soc} size={64} />}
        />

        {/* 집 충전소 */}
        <Card
          href="/chargers"
          accent="#fbbf24"
          label="집 충전소"
          headline={
            chargers?.success_rate_today != null
              ? `${chargers.success_rate_today}% 성공`
              : (chargers?.is_fresh ? '정상' : '대기')
          }
          sub={
            chargers
              ? `${chargers.is_fresh ? '폴링 정상' : '폴링 오래됨'}${
                  chargers.ttl_min != null ? ` · TTL ${chargers.ttl_min}분` : ''
                }${chargers.last_fetched ? ` · ${relTime(chargers.last_fetched)}` : ''}`
              : '데이터 없음'
          }
          right={
            chargers?.is_fresh && (
              <div className="relative">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#fbbf24' }} />
                <div className="absolute inset-0 w-2.5 h-2.5 rounded-full animate-ping" style={{ background: '#fbbf24', opacity: 0.6 }} />
              </div>
            )
          }
        />
      </div>
    </main>
  );
}
