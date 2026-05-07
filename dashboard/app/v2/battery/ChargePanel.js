'use client';

import { useState } from 'react';
import MonthlyChargeCard from './MonthlyChargeCard';
import FastChargeCard from './FastChargeCard';
import SlowChargeCard from './SlowChargeCard';
import ChargeHeatmap from './ChargeHeatmap';

const TABS = [
  { key: 'summary', label: '요약' },
  { key: 'fast',    label: '급속' },
  { key: 'slow',    label: '완속' },
];

export default function ChargePanel() {
  const [tab, setTab] = useState('summary');

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-2 pt-2 pb-0 flex gap-1 border-b border-white/[0.06]">
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex-1 px-3 py-2 text-xs font-bold rounded-t-lg transition-colors ${
                active
                  ? 'text-blue-400 bg-white/[0.04] border-b-2 border-blue-500 -mb-px'
                  : 'text-zinc-500 hover:text-zinc-300 border-b-2 border-transparent'
              }`}
              aria-selected={active}
              role="tab"
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 모든 탭을 렌더 + display 토글 — 탭 전환 시 fetch/스크롤/펼침 상태 보존 */}
      <div className={tab === 'summary' ? '' : 'hidden'}>
        <MonthlyChargeCard flat />
        <div className="border-t border-white/[0.06]">
          <ChargeHeatmap flat />
        </div>
      </div>
      <div className={tab === 'fast' ? '' : 'hidden'}>
        <FastChargeCard flat />
      </div>
      <div className={tab === 'slow' ? '' : 'hidden'}>
        <SlowChargeCard flat />
      </div>
    </div>
  );
}
