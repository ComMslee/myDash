'use client';

import { useEffect, useState } from 'react';
import YearHeatmap from '@/app/components/YearHeatmap';

export default function ChargeHeatmap() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/year-heatmap')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <YearHeatmap
      data={data}
      loading={loading}
      title="지난 1년 충전"
      metric="kwh"
      color="#22c55e"
      legendLabel="충전"
      latestLeft
    />
  );
}
