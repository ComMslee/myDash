'use client';

import { useEffect, useState } from 'react';
import { Section } from './_components/Section';
import { HubStatus } from './_components/HubStatus';
import { Tabs } from './_components/Tabs';
import { PermPane } from './_components/PermPane';
import { BroadcastPane } from './_components/BroadcastPane';
import { GuidePane } from './_components/GuidePane';

export default function TgPage() {
  const [data, setData] = useState(null);
  const [view, setView] = useState('loading'); // 'loading' | 'admin' | 'public'
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('perm');

  async function load() {
    try {
      const r = await fetch('/api/tg', { cache: 'no-store' });
      if (r.status === 401 || r.status === 412) {
        setView('public');
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setData(j);
      setView('admin');
      setErr(null);
    } catch (e) {
      setErr(e.message || String(e));
      setView('admin');
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  async function action(payload) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/tg/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'failed');
      await load();
    } catch (e) {
      alert(`실패: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (view === 'loading') {
    return (
      <main className="min-h-screen bg-[#0f0f0f] text-white p-4">
        <div className="text-zinc-500">로딩 중…</div>
      </main>
    );
  }

  if (view === 'public') {
    return (
      <main className="min-h-screen bg-[#0f0f0f] text-white">
        <div className="max-w-2xl mx-auto px-4 py-5 pb-12 flex flex-col gap-4">
          <h1 className="text-xl font-light">📖 봇 가이드</h1>
          <Section title="📖 사용법">
            <GuidePane />
          </Section>
        </div>
      </main>
    );
  }

  if (err && !data) {
    return (
      <main className="min-h-screen bg-[#0f0f0f] text-white p-4">
        <div className="text-rose-300">로딩 실패 — {err}</div>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="min-h-screen bg-[#0f0f0f] text-white p-4">
        <div className="text-zinc-500">로딩 중…</div>
      </main>
    );
  }

  const { hubHealth, users, pending, unmatched, categories, userGroups } = data;

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="max-w-2xl mx-auto px-4 py-5 pb-12 flex flex-col gap-4">
        <h1 className="text-xl font-light">🤖 Telegram 봇 관리</h1>

        <HubStatus health={hubHealth} />

        <Tabs tab={tab} onChange={setTab} />

        {tab === 'perm' && (
          <PermPane
            pending={pending}
            users={users}
            userGroups={userGroups}
            categories={categories}
            action={action}
            busy={busy}
          />
        )}
        {tab === 'broadcast' && (
          <BroadcastPane
            userGroups={userGroups}
            unmatched={unmatched}
            action={action}
            busy={busy}
          />
        )}
        {tab === 'guide' && (
          <Section title="📖 사용법">
            <GuidePane />
          </Section>
        )}
      </div>
    </main>
  );
}
