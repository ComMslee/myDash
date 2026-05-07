'use client';

// 목업 — Apple Maps 스타일 peek bottom sheet 네비게이션 안.
// 실제 라우팅/데이터 안 붙임. 시각·인터랙션 검토용.
// /v2/dev/* 경로라 BottomNavV2 자동 숨김 → 깨끗한 미리보기.

import { useState, useRef, useEffect, useCallback } from 'react';

const PINNED = [
  { key: 'drives', label: '주행', icon: '🚗' },
  { key: 'battery', label: '배터리', icon: '🔋' },
  { key: 'chargers', label: '집충전소', icon: '⚡' },
];

const ALL_DOMAINS = [
  { key: 'drives', label: '주행', icon: '🚗', desc: '실시간 차량 상태', group: 'main' },
  { key: 'history', label: '이력', icon: '📜', desc: '과거 주행 리스트', group: 'main' },
  { key: 'battery', label: '배터리', icon: '🔋', desc: '건강도·충전 패턴', group: 'main' },
  { key: 'chargers', label: '집충전소', icon: '⚡', desc: '집·이웃 충전기', group: 'main' },
  { key: 'spotify', label: '음악', icon: '🎵', desc: 'Spotify 매시업', group: 'apps' },
  { key: 'tg', label: '텔레그램', icon: '✈️', desc: '봇·구독자 관리', group: 'apps' },
  { key: 'api-status', label: 'API 상태', icon: '🔧', desc: '라우트 헬스', group: 'admin' },
  { key: 'spotify-relogin', label: 'Spotify 재인증', icon: '🔄', desc: 'refresh_token', group: 'admin' },
  { key: 'auth', label: '인증 설정', icon: '🔐', desc: '로그인 비밀번호', group: 'admin' },
];

// 3 단계 — peek / half / full. 픽셀 높이 기준.
const STATES = {
  peek: 88,
  half: 0.55, // viewport 비율
  full: 0.9,
};

function getHeights() {
  if (typeof window === 'undefined') return { peek: 88, half: 400, full: 700 };
  const vh = window.innerHeight;
  return {
    peek: STATES.peek,
    half: Math.round(vh * STATES.half),
    full: Math.round(vh * STATES.full),
  };
}

export default function MockupNav() {
  const [stateName, setStateName] = useState('peek'); // peek | half | full
  const [activeDomain, setActiveDomain] = useState('battery');
  const [search, setSearch] = useState('');
  const [heights, setHeights] = useState({ peek: 88, half: 400, full: 700 });

  const sheetRef = useRef(null);
  const dragStartY = useRef(null);
  const dragStartHeight = useRef(null);
  const [dragHeight, setDragHeight] = useState(null);

  useEffect(() => {
    const onResize = () => setHeights(getHeights());
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const currentHeight = dragHeight ?? heights[stateName];

  const onPointerDown = useCallback((e) => {
    dragStartY.current = e.clientY ?? e.touches?.[0]?.clientY;
    dragStartHeight.current = heights[stateName];
    setDragHeight(heights[stateName]);
  }, [heights, stateName]);

  const onPointerMove = useCallback((e) => {
    if (dragStartY.current == null) return;
    const y = e.clientY ?? e.touches?.[0]?.clientY;
    const delta = dragStartY.current - y; // 위로 드래그 = 양수
    const next = Math.min(heights.full, Math.max(heights.peek, dragStartHeight.current + delta));
    setDragHeight(next);
  }, [heights]);

  const onPointerUp = useCallback(() => {
    if (dragStartY.current == null) return;
    const h = dragHeight ?? heights[stateName];
    // 가까운 snap 으로
    const dPeek = Math.abs(h - heights.peek);
    const dHalf = Math.abs(h - heights.half);
    const dFull = Math.abs(h - heights.full);
    const min = Math.min(dPeek, dHalf, dFull);
    if (min === dPeek) setStateName('peek');
    else if (min === dHalf) setStateName('half');
    else setStateName('full');
    dragStartY.current = null;
    dragStartHeight.current = null;
    setDragHeight(null);
  }, [dragHeight, heights, stateName]);

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  const cycleState = () => {
    setStateName(s => (s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek'));
  };

  const filteredDomains = ALL_DOMAINS.filter(d =>
    !search || d.label.includes(search) || d.desc.includes(search)
  );

  const groupedDomains = {
    main: filteredDomains.filter(d => d.group === 'main'),
    apps: filteredDomains.filter(d => d.group === 'apps'),
    admin: filteredDomains.filter(d => d.group === 'admin'),
  };

  const expanded = stateName !== 'peek';

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white relative overflow-hidden">
      {/* 배경 — 가짜 배터리 페이지 콘텐츠 (현실감 위해) */}
      <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4" style={{ paddingBottom: heights.peek + 24 }}>
        <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-5">
          <div className="text-xs text-zinc-500 mb-2">건강도</div>
          <div className="text-4xl font-bold">86<span className="text-xl text-zinc-400">%</span></div>
          <div className="text-xs text-zinc-500 mt-1">12개월 추세 ▼ 1.2%</div>
        </div>
        <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-5">
          <div className="text-xs text-zinc-500 mb-2">유휴 방전</div>
          <div className="text-2xl font-bold">0.4 <span className="text-sm text-zinc-400">%/일</span></div>
          <div className="grid grid-cols-7 gap-1 mt-3">
            {Array.from({ length: 28 }).map((_, i) => (
              <div key={i} className="h-3 rounded-sm" style={{ background: `rgba(96,165,250,${0.15 + (i % 4) * 0.15})` }} />
            ))}
          </div>
        </div>
        <div className="bg-[#161618] border border-white/[0.06] rounded-2xl p-5">
          <div className="text-xs text-zinc-500 mb-2">최근 충전</div>
          <div className="space-y-2">
            {['12/05 · 집 21→80%', '12/04 · 슈퍼차저 30→78%', '12/02 · 집 45→90%'].map(t => (
              <div key={t} className="text-sm text-zinc-300">{t}</div>
            ))}
          </div>
        </div>

        <div className="text-center text-xs text-zinc-600 mt-4">
          ↓ 아래 sheet 핸들을 드래그하거나 탭해서 펼쳐보세요
        </div>
      </div>

      {/* 펼침 시 backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity ${expanded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setStateName('peek')}
      />

      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        className="fixed bottom-0 left-0 right-0 z-50 bg-[#161618] border-t border-white/[0.08] rounded-t-3xl shadow-2xl"
        style={{
          height: currentHeight,
          transition: dragHeight == null ? 'height 220ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* 핸들 — 드래그 영역 */}
        <div
          className="flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing select-none"
          style={{ touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onClick={(e) => {
            // 드래그 없이 그냥 탭이면 다음 상태로
            if (dragStartY.current == null) cycleState();
          }}
        >
          <div className="w-10 h-1.5 rounded-full bg-white/[0.18]" />
        </div>

        {/* PEEK 콘텐츠 — 핀 3개 + 활성 표시 */}
        {!expanded && (
          <div className="px-3 pb-2">
            <div className="flex items-center justify-around">
              {PINNED.map(p => {
                const isActive = activeDomain === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={(e) => { e.stopPropagation(); setActiveDomain(p.key); }}
                    className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl mx-0.5 transition-colors ${
                      isActive ? 'bg-blue-500/[0.12]' : ''
                    }`}
                  >
                    <span className="text-2xl leading-none">{p.icon}</span>
                    <span className={`text-[10px] font-semibold ${isActive ? 'text-blue-400' : 'text-zinc-400'}`}>{p.label}</span>
                  </button>
                );
              })}
              <button
                onClick={(e) => { e.stopPropagation(); setStateName('half'); }}
                className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl mx-0.5"
              >
                <span className="text-2xl leading-none">⋯</span>
                <span className="text-[10px] font-semibold text-zinc-400">전체</span>
              </button>
            </div>
          </div>
        )}

        {/* HALF / FULL 콘텐츠 — 검색 + 그리드 */}
        {expanded && (
          <div className="px-4 pb-4 overflow-y-auto" style={{ height: currentHeight - 36 }}>
            {/* 검색 */}
            <div className="sticky top-0 -mx-4 px-4 pb-3 bg-[#161618] z-10">
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="도메인 검색…"
                  className="w-full bg-[#0f0f0f] border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/40"
                />
              </div>
            </div>

            {/* 메인 도메인 */}
            {groupedDomains.main.length > 0 && (
              <div className="mb-5">
                <div className="text-[10px] font-bold tracking-widest uppercase text-zinc-500 mb-2 px-1">차량</div>
                <div className="grid grid-cols-3 gap-2">
                  {groupedDomains.main.map(d => (
                    <DomainTile key={d.key} d={d} active={activeDomain === d.key} onTap={() => { setActiveDomain(d.key); setStateName('peek'); }} />
                  ))}
                </div>
              </div>
            )}

            {/* 앱 */}
            {groupedDomains.apps.length > 0 && (
              <div className="mb-5">
                <div className="text-[10px] font-bold tracking-widest uppercase text-zinc-500 mb-2 px-1">앱</div>
                <div className="grid grid-cols-3 gap-2">
                  {groupedDomains.apps.map(d => (
                    <DomainTile key={d.key} d={d} active={activeDomain === d.key} onTap={() => { setActiveDomain(d.key); setStateName('peek'); }} />
                  ))}
                </div>
              </div>
            )}

            {/* 관리 — full 또는 검색 시에만 */}
            {(stateName === 'full' || search) && groupedDomains.admin.length > 0 && (
              <div className="mb-5">
                <div className="text-[10px] font-bold tracking-widest uppercase text-zinc-500 mb-2 px-1">관리</div>
                <div className="grid grid-cols-3 gap-2">
                  {groupedDomains.admin.map(d => (
                    <DomainTile key={d.key} d={d} active={activeDomain === d.key} onTap={() => { setActiveDomain(d.key); setStateName('peek'); }} />
                  ))}
                </div>
              </div>
            )}

            {/* full 로 더 펼치기 힌트 */}
            {stateName === 'half' && !search && (
              <button
                onClick={() => setStateName('full')}
                className="w-full py-3 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                ↑ 더 펼치기 — 관리 도구 보기
              </button>
            )}

            {filteredDomains.length === 0 && (
              <div className="text-center text-zinc-500 text-sm py-8">검색 결과 없음</div>
            )}
          </div>
        )}
      </div>

      {/* 디버그 — 현재 상태 표시 (개발용, 실제 출시 시 제거) */}
      <div className="fixed top-3 right-3 z-50 bg-black/70 backdrop-blur px-2.5 py-1 rounded-full text-[10px] text-zinc-400 border border-white/[0.06]">
        state: <span className="text-blue-400 font-bold">{stateName}</span> · h: {Math.round(currentHeight)}px
      </div>
    </main>
  );
}

function DomainTile({ d, active, onTap }) {
  return (
    <button
      onClick={onTap}
      className={`flex flex-col items-center gap-1 py-3 px-2 rounded-2xl border transition-colors ${
        active
          ? 'bg-blue-500/[0.12] border-blue-500/30'
          : 'bg-[#0f0f0f] border-white/[0.06] hover:border-white/[0.12]'
      }`}
    >
      <span className="text-2xl leading-none">{d.icon}</span>
      <span className={`text-[11px] font-semibold ${active ? 'text-blue-400' : 'text-zinc-300'}`}>{d.label}</span>
      <span className="text-[9px] text-zinc-600 leading-tight text-center line-clamp-1">{d.desc}</span>
    </button>
  );
}
