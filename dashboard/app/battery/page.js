'use client';

import { useState, useEffect } from 'react';
import HealthScoreCard from './HealthScoreCard';
import CycleCard from './CycleCard';
import WeeklyCard from './WeeklyCard';
import { DailyRecordsCard, LevelHabitCard } from './RecordsHabit';

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-7 h-7 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
    </div>
  );
}

function SectionLabel({ title }) {
  return (
    <div className="flex items-center px-0.5 mb-2">
      <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-600">{title}</span>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────

export default function BatteryPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/battery')
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setData(d);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message || '데이터를 불러오지 못했습니다.');
        setLoading(false);
      });
  }, []);

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 py-5 pb-24 flex flex-col gap-5">
        {loading ? (
          <Spinner />
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        ) : data ? (
          <>
            <div>
              <SectionLabel title="배터리 관리 점수" />
              <HealthScoreCard data={data.health} />
            </div>

            <div>
              <SectionLabel title="배터리 사이클" />
              <CycleCard data={data.cycle} />
            </div>

            <div>
              <SectionLabel title="주간 패턴" />
              <WeeklyCard weeks={data.weekly} />
            </div>

            <div>
              <SectionLabel title="일간 레코드" />
              <DailyRecordsCard records={data.daily_records} />
            </div>

            <div>
              <SectionLabel title="충전 레벨 습관" />
              <LevelHabitCard histogram={data.histogram} />
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
