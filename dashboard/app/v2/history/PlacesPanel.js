'use client';

import { Icon } from '@/app/lib/Icons';
import { shortAddr } from '@/lib/format';

// 체류 시간 포맷 — 초 단위 → 분/시간/일/주 자동 스케일.
function fmtDwell(sec) {
  if (sec == null) return '—';
  if (sec < 60) return `${Math.floor(sec)}초`;
  if (sec < 3600) return `${Math.floor(sec / 60)}분`;
  if (sec < 86400) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return m === 0 ? `${h}시간` : `${h}h${m}m`;
  }
  if (sec < 7 * 86400) {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    return h === 0 ? `${d}일` : `${d}일 ${h}h`;
  }
  const w = Math.floor(sec / (7 * 86400));
  const d = Math.floor((sec % (7 * 86400)) / 86400);
  return d === 0 ? `${w}주` : `${w}주 ${d}일`;
}

// 자주 가는 곳 / 오래 머문 곳 — 탭 토글로 메트릭 전환.
// onSelectPlace(p): 부모가 selectedPlace 설정 + map view 전환 cascade 처리.
export default function PlacesPanel({
  places, longStayPlaces,
  selectedPlace,
  collapsed, setCollapsed,
  expanded, setExpanded,
  mode, setMode,
  onSelectPlace,
}) {
  if (places.length === 0 && longStayPlaces.length === 0) return null;
  const isLong = mode === 'long-stay';
  const displayPlaces = isLong ? longStayPlaces : places;
  if (displayPlaces.length === 0) return null;
  const titleIcon = isLong ? 'clock' : 'pin';
  const titleLabel = isLong ? '오래 머문 곳' : '자주 가는 곳';
  const metric = (p) => isLong ? fmtDwell(p.max_dwell_sec) : `${p.visit_count}회`;

  return (
    <div className="flex-shrink-0 px-4 pt-2 pb-1.5">
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          className="w-full flex items-center justify-between px-3 py-1.5 bg-zinc-800/40 border border-white/[0.06] rounded-lg hover:bg-zinc-800/70 transition-colors"
        >
          <span className="text-xs text-zinc-400 inline-flex items-center gap-1"><Icon name={titleIcon} className="w-4 h-4" />{titleLabel} <span className="text-zinc-600 ml-1">· {displayPlaces.length}개</span></span>
          <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      ) : (
        <>
          {/* 토글을 카드 행 첫 칸으로 인라인 — 별도 줄 차지 제거. 카드 높이에 맞춰 세로 분할. */}
          <div className="flex items-stretch gap-2 overflow-x-auto no-scrollbar">
            <div className="flex-shrink-0 flex flex-col gap-0.5 bg-zinc-800/40 border border-white/[0.06] rounded-xl p-0.5 w-[40px]">
              <button
                onClick={() => { setMode('frequent'); setExpanded(false); }}
                aria-label="자주 가는 곳"
                title="자주 가는 곳"
                className={`flex-1 flex items-center justify-center rounded-lg transition-colors ${
                  !isLong ? 'bg-white/[0.10] text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Icon name="pin" className="w-5 h-5" />
              </button>
              <button
                onClick={() => { setMode('long-stay'); setExpanded(false); }}
                aria-label="오래 머문 곳"
                title="오래 머문 곳"
                className={`flex-1 flex items-center justify-center rounded-lg transition-colors ${
                  isLong ? 'bg-white/[0.10] text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Icon name="clock" className="w-5 h-5" />
              </button>
            </div>
            {displayPlaces.slice(0, 5).map((p, i) => (
              <button
                key={p.id}
                onClick={() => onSelectPlace(p)}
                className={`flex-shrink-0 flex flex-col gap-1.5 border rounded-xl px-3 py-3 w-[130px] text-left transition-colors ${
                  selectedPlace?.id === p.id
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : 'bg-zinc-800/60 border-white/[0.06] hover:bg-zinc-800/90'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-zinc-600 text-sm font-bold leading-none">#{i + 1}</span>
                  <span className="text-zinc-500 text-xs leading-none tabular-nums">{metric(p)}</span>
                </div>
                <p className="text-zinc-300 text-xs leading-snug line-clamp-3 flex-1">{p.label || p.city || '—'}</p>
              </button>
            ))}
            {displayPlaces.length > 5 && (
              <button
                onClick={() => setExpanded(v => !v)}
                className={`flex-shrink-0 flex flex-col items-center justify-center gap-1 border rounded-xl px-3 py-3 w-[64px] transition-colors ${
                  expanded
                    ? 'bg-blue-500/15 border-blue-500/30'
                    : 'bg-zinc-800/40 border-white/[0.06] hover:bg-zinc-800/70'
                }`}
              >
                <span className={`text-lg font-bold leading-none ${expanded ? 'text-blue-300' : 'text-zinc-400'}`}>{expanded ? '×' : '···'}</span>
                <span className={`text-xs ${expanded ? 'text-blue-300' : 'text-zinc-500'}`}>{expanded ? '접기' : '더보기'}</span>
              </button>
            )}
          </div>
          {expanded && (
            <div className="mt-2 border border-white/[0.06] rounded-xl bg-[#161618] overflow-hidden">
              <div className="overflow-y-auto" style={{ maxHeight: '40vh' }}>
                {displayPlaces.slice(5).map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => { setExpanded(false); onSelectPlace(p); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.05] last:border-0 hover:bg-white/[0.03] transition-colors text-left"
                  >
                    <span className="text-sm font-black w-7 text-center flex-shrink-0 text-zinc-600">{i + 6}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-zinc-300 text-sm truncate">{p.label || p.city || '—'}</p>
                      {p.city && p.label !== p.city && <p className="text-zinc-600 text-xs truncate">{p.city}</p>}
                    </div>
                    <span className="text-zinc-400 text-sm tabular-nums flex-shrink-0">{metric(p)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
