'use client';

// Nav 패러다임 비교 인덱스 — 페이지 내부 무수정, nav 이동법만.

import Link from 'next/link';

const VARIANTS = [
  {
    key: 'd',
    label: 'D. Grounded ⭐ (추천)',
    desc: '무화려 보수안 — floating 0, 시트 0, 데코 0. 메인 4탭 + 앱 풀페이지',
    color: 'text-fuchsia-400',
  },
  {
    key: 'a',
    label: 'A. Floating Dock',
    desc: 'Mac Dock 스타일 — 떠있는 알약 dock (장식 위주)',
    color: 'text-zinc-500',
  },
  {
    key: 'b',
    label: 'B. Radial FAB',
    desc: '우하단 + 부채꼴 폭발 (장식 위주)',
    color: 'text-zinc-500',
  },
  {
    key: 'ab',
    label: 'AB. Dock + Radial Overflow',
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
          ※ 사용자 피드백: floating/장식 자체가 거슬림 + 9 도메인이 너무 많음 → D 안 도출.
          <br />※ A·B·AB·C 는 비교용 보존 (장식 위주라 폐기 후보).
        </div>
      </div>
    </main>
  );
}
