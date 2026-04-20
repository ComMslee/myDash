'use client';
import { useState, useEffect } from 'react';

const TYPE_LABEL = {
  '01': 'DC차데모', '02': 'AC완속', '03': 'DC차데모+AC3상', '04': 'DC콤보',
  '05': 'DC차데모+DC콤보', '06': 'DC차데모+AC3상+DC콤보', '07': 'AC3상', '08': 'DC콤보(완속)',
};

const STAT_META = {
  '2': { label: '대기', dot: 'bg-emerald-500', text: 'text-emerald-400' },
  '3': { label: '충전중', dot: 'bg-blue-500', text: 'text-blue-400' },
  '4': { label: '운영중지', dot: 'bg-zinc-600', text: 'text-zinc-400' },
  '5': { label: '점검중', dot: 'bg-amber-500', text: 'text-amber-400' },
  '1': { label: '통신이상', dot: 'bg-rose-500', text: 'text-rose-400' },
  '9': { label: '확인불가', dot: 'bg-zinc-700', text: 'text-zinc-500' },
};

function formatUpdDt(s) {
  if (!s || s.length < 12) return '';
  const mo = s.slice(4, 6), d = s.slice(6, 8), h = s.slice(8, 10), mi = s.slice(10, 12);
  return `${mo}/${d} ${h}:${mi}`;
}

export default function HomeChargerCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch('/api/home-charger')
        .then(r => r.json())
        .then(d => {
          if (!alive) return;
          if (d.error) setError(d.error); else setData(d);
          setLoading(false);
        })
        .catch(e => { if (alive) { setError(e.message); setLoading(false); } });
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (loading) {
    return (
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl flex items-center justify-center py-10">
        <div className="w-5 h-5 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="bg-[#161618] border border-white/[0.06] rounded-2xl px-4 py-3 text-xs text-zinc-500">
        집충전기 정보를 불러오지 못했습니다{error ? ` — ${error}` : ''}.
      </div>
    );
  }

  const { station, chargers } = data;
  const counts = chargers.reduce((acc, c) => {
    acc[c.stat] = (acc[c.stat] || 0) + 1;
    return acc;
  }, {});
  const typeLabel = TYPE_LABEL[chargers[0]?.chgerType] || '';
  const output = chargers[0]?.output;
  const latestUpd = chargers
    .map(c => c.statUpdDt)
    .filter(Boolean)
    .sort()
    .pop();

  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-widest uppercase text-zinc-500">집충전기</span>
        <span className="text-[11px] text-zinc-500">{station.useTime}</span>
      </div>

      <div className="px-4 py-3">
        <div className="mb-3">
          <div className="text-[15px] font-semibold text-white">{station.statNm}</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">{station.addr}</div>
          <div className="text-[11px] text-zinc-500 mt-1">
            <span className="text-zinc-400">{station.busiNm}</span>
            <span className="mx-1.5 text-zinc-700">·</span>
            <span>{typeLabel}{output ? ` ${output}kW` : ''}</span>
            <span className="mx-1.5 text-zinc-700">·</span>
            <span>총 {chargers.length}기</span>
            {station.parkingFree && (
              <>
                <span className="mx-1.5 text-zinc-700">·</span>
                <span className="text-emerald-400/80">주차무료</span>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-8 gap-1.5 mb-3">
          {chargers.map(c => {
            const meta = STAT_META[c.stat] || STAT_META['9'];
            return (
              <div
                key={c.chgerId}
                className={`relative aspect-square rounded-md border border-white/[0.06] bg-zinc-900 flex items-center justify-center text-[10px] tabular-nums text-zinc-300`}
                title={`${c.chgerId}번 · ${meta.label}`}
              >
                <span>{Number(c.chgerId)}</span>
                <span className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full ${meta.dot}`} />
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums">
          {['2', '3', '5', '1', '4', '9'].map(k => {
            const n = counts[k];
            if (!n) return null;
            const meta = STAT_META[k];
            return (
              <span key={k} className={`flex items-center gap-1 ${meta.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                {meta.label} {n}
              </span>
            );
          })}
          {latestUpd && (
            <span className="ml-auto text-[11px] text-zinc-600">
              갱신 {formatUpdDt(latestUpd)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
