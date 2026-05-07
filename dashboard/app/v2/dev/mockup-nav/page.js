'use client';

// Nav 패러다임 비교 인덱스 — 페이지 내부 무수정, nav 이동법만.

import Link from 'next/link';

const VARIANTS = [
  {
    key: 'g',
    label: 'G. Nav + Bottom Panel ⭐',
    desc: '하단 5탭 + 그 위 라이브 차량 상태 패널 (Apple Music 미니플레이어 패턴)',
    color: 'text-fuchsia-400',
  },
  {
    key: 'f',
    label: 'F. Top Pills (지도앱 스타일)',
    desc: '상단 카테고리 칩 가로 스크롤, 하단 탭 없음',
    color: 'text-blue-400',
  },
  {
    key: 'd',
    label: 'D. Grounded',
    desc: '평범한 하단 4탭 + 앱 풀페이지',
    color: 'text-blue-400',
  },
  {
    key: 'a',
    label: 'A. Floating Dock',
    desc: '떠있는 알약 dock (장식 위주)',
    color: 'text-zinc-500',
  },
  {
    key: 'b',
    label: 'B. Radial FAB',
    desc: '우하단 + 부채꼴 (장식 위주)',
    color: 'text-zinc-500',
  },
  {
    key: 'ab',
    label: 'AB. Dock + Radial',
    desc: 'A + B 믹스 (장식 위주)',
    color: 'text-zinc-500',
  },
  {
    key: 'c',
    label: 'C. Breadcrumb Top',
    desc: '상단 풀다운 (별로 평가됨)',
    color: 'text-zinc-500',
  },
];

export default function MockupNavIndex() {
  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Nav 패러다임 비교</h1>
        <p className="text-sm text-zinc-400 leading-relaxed">
          페이지 내부 카드/콘텐츠는 <span className="text-zinc-200">무수정</span> — 메뉴 이동법만.
        </p>

        <div className="flex flex-col gap-3 mt-2">
          {VARIANTS.map(v => (
            <Link
              key={v.key}
              href={`/v2/dev/mockup-nav/${v.key}`}
              className="bg-[#161618] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.12] active:bg-white/[0.03] transition-colors"
            >
              <div className={`text-lg font-bold ${v.color}`}>{v.label}</div>
              <div className="text-sm text-zinc-400 mt-1.5 leading-snug">{v.desc}</div>
            </Link>
          ))}
        </div>

        <div className="mt-6 p-4 rounded-xl bg-zinc-900/40 border border-white/[0.04] text-xs text-zinc-500 leading-relaxed">
          ※ 사용자 피드백: floating 자체 거슬림 + 9 도메인 너무 많음 + 데코 싫음.
          <br />※ G 의 라이브 패널은 데코 아닌 정보 (실시간 차량 상태) — Apple Music 미니플레이어 동등.
        </div>
      </div>
    </main>
  );
}
