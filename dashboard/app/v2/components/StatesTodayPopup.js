'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../lib/Icons';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function kstDateStr(ms) {
  const d = new Date(ms + 9 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function fmtTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtDuration(min) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function dayLabel(key, todayKey) {
  if (key === todayKey) return '오늘';
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = WEEKDAYS[date.getUTCDay()];
  return `${m}/${d} (${dow})`;
}

export default function StatesTodayPopup({ open, onClose }) {
  const todayKey = useMemo(() => kstDateStr(Date.now()), []);
  const days = useMemo(() => {
    const out = [];
    const todayMs = new Date(todayKey + 'T00:00:00Z').getTime();
    for (let i = 0; i < 7; i++) {
      out.push(kstDateStr(todayMs - i * 86400_000));
    }
    return out;
  }, [todayKey]);

  const [selected, setSelected] = useState(todayKey);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!open) return;
    setSelected(todayKey);
  }, [open, todayKey]);

  useEffect(() => {
    if (!open) return;
    setData(null);
    const url = selected === todayKey ? '/api/states-today' : `/api/states-today?date=${selected}`;
    fetch(url)
      .then(r => r.json())
      .then(j => setData(j.segments || []))
      .catch(() => setData([]));
  }, [open, selected, todayKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const segs = data || [];
  const onlineSegs = segs.filter(s => s.type === 'online');
  const chargeSegs = segs.filter(s => s.type === 'charging');
  const totalOnlineMin = onlineSegs.reduce((t, s) => t + s.minutes, 0);
  const sentryCount = onlineSegs.filter(s => s.sentry_suspect).length;
  const climateCount = onlineSegs.filter(s => s.climate_minutes > 0).length;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="온라인 타임라인"
    >
      <div
        className="w-full max-w-md bg-[#0f0f0f] border border-white/[0.08] rounded-2xl shadow-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-zinc-200">온라인</h2>
            <p className="text-[10px] text-zinc-500 mt-0.5 flex items-center gap-1 flex-wrap">
              <span>총 {fmtDuration(totalOnlineMin)}</span>
              <span className="text-zinc-700">·</span>
              <span className="inline-flex items-center gap-0.5 text-yellow-400"><Icon name="bolt" className="w-3 h-3" />{chargeSegs.length}</span>
              <span className="inline-flex items-center gap-0.5 text-sky-300"><Icon name="climate" className="w-3 h-3" />{climateCount}</span>
              <span className="inline-flex items-center gap-0.5 text-fuchsia-300"><Icon name="shield" className="w-3 h-3" />{sentryCount}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 p-1"
            aria-label="닫기"
          >
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        {/* 일자 선택 — 오늘 + 6일 전까지 */}
        <div className="px-2 py-2 border-b border-white/[0.06] overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {days.map(key => {
              const active = key === selected;
              return (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium tabular-nums whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      : 'bg-zinc-800/60 text-zinc-400 border border-white/[0.04] hover:bg-zinc-700/60'
                  }`}
                >
                  {dayLabel(key, todayKey)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-2">
          {!data ? (
            <p className="text-xs text-zinc-500 text-center py-6">로딩…</p>
          ) : segs.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-6">온라인 기록이 없습니다</p>
          ) : (
            <div className="space-y-1">
              {[...segs].reverse().map((s, i) => {
                const isCharge = s.type === 'charging';
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs ${
                      isCharge
                        ? 'bg-yellow-500/[0.06] border border-yellow-500/20'
                        : s.sentry_suspect
                        ? 'bg-fuchsia-500/[0.06] border border-fuchsia-500/20'
                        : ''
                    }`}
                  >
                    <span className="text-zinc-300 tabular-nums flex-shrink-0">
                      {fmtTime(s.start)}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                      {isCharge && (
                        <span className="text-yellow-400 inline-flex" title={`충전 +${s.soc_added}% (${s.soc_start}→${s.soc_end})`}>
                          <Icon name="bolt" className="w-3.5 h-3.5" filled />
                        </span>
                      )}
                      {!isCharge && s.climate_minutes > 0 && (
                        <span className="text-sky-300 inline-flex" title={`공조 ${s.climate_minutes}분${s.climate_pct != null ? ` · ~${s.climate_pct}%` : ''}`}>
                          <Icon name="climate" className="w-3.5 h-3.5" />
                        </span>
                      )}
                      {!isCharge && s.sentry_suspect && (
                        <span className="text-fuchsia-300 inline-flex" title={`센트리 의심 ${s.sentry_minutes}분 · ~${s.sentry_pct}%`}>
                          <Icon name="shield" className="w-3.5 h-3.5" />
                        </span>
                      )}
                      <span className="text-zinc-200 tabular-nums font-medium">
                        {fmtDuration(s.minutes)}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
