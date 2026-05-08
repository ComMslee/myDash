'use client';

import Link from 'next/link';
import PollLogBody from '@/app/v2/battery/home-charger/poll-log/PollLogBody';

export default function PollLogPage() {
  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-base font-bold text-zinc-100">폴링 로그</h1>
          <Link
            href="/chargers"
            className="text-[12px] text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08]"
          >
            ← 집 충전소
          </Link>
        </div>
        <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
          <PollLogBody />
        </div>
      </div>
    </main>
  );
}
