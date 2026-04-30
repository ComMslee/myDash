'use client';

import ReportPanel from '../_parts/ReportPanel';

// 외부 캡처/공유 전용 단독 페이지 — /v2/chargers 하단의 패널과 같은 컴포넌트 재사용.
export default function ChargerReportPage() {
  return (
    <main className="min-h-screen bg-[#0f0f0f] text-zinc-100">
      <div className="max-w-2xl mx-auto p-4 pb-12">
        <ReportPanel />
      </div>
    </main>
  );
}
