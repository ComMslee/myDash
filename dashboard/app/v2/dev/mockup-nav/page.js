'use client';

// Nav 패러다임 비교 인덱스 — 페이지 내부 무수정, nav 이동법만.

import Link from 'next/link';

const VARIANTS = [
  {
    key: 'a',
    label: 'A. Floating Dock',
    desc: 'Mac Dock 스타일 — 하단 반투명 dock, 4 상시 + ⋯ 평면 그리드 펼침',
    color: 'text-blue-400',
  },
  {
    key: 'b',
    label: 'B. Radial FAB',
    desc: '우하단 + 버튼 → 9 도메인 부채꼴 폭발, 평상시 화면 점유 0%',
    color: 'text-emerald-400',
  },
  {
    key: 'ab',
    label: 'AB. Dock + Radial Overflow ⭐',
    desc: 'A 의 dock + B 의 부채꼴 — 4 상시 + ⋯ 누르면 5개가 부채꼴로 폭발',
    color: 'text-fuchsia-400',
  },
  {
    key: 'c',
    label: 'C. Breadcrumb Top',
    desc: '상단 "현재 도메인 ▾" 한 줄, 풀다운 (별로 평가됨)',
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
          가상 배터리 콘텐츠 위에 각 nav 가 어떻게 동작하는지 시각.
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
          ※ 이전 Apple Maps peek sheet 안은 거부됨. 본 비교에서 제외.
          <br />※ 9 도메인: 주행 / 이력 / 배터리 / 집충전소 / 음악 / 텔레그램 / API상태 / Spotify재인증 / 인증
        </div>
      </div>
    </main>
  );
}
