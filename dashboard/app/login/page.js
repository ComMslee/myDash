'use client';

import { Suspense, useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const PIN_LENGTH = 6;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') || '/';
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async (value) => {
      setBusy(true);
      setError('');
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pin: value }),
        });
        if (res.ok) {
          router.replace(next);
          return;
        }
        if (res.status === 429) {
          const j = await res.json().catch(() => ({}));
          setError(`시도 초과 — ${j.retryAfter ?? 60}초 뒤 다시 시도하세요`);
        } else {
          setError('PIN이 올바르지 않습니다');
        }
        setPin('');
      } catch {
        setError('네트워크 오류 — 다시 시도해주세요');
        setPin('');
      } finally {
        setBusy(false);
      }
    },
    [router, next],
  );

  const press = (digit) => {
    if (busy) return;
    setError('');
    if (pin.length >= PIN_LENGTH) return;
    const v = pin + digit;
    setPin(v);
    if (v.length === PIN_LENGTH) submit(v);
  };

  const back = () => {
    if (busy) return;
    setError('');
    setPin(p => p.slice(0, -1));
  };

  const clear = () => {
    if (busy) return;
    setError('');
    setPin('');
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-10">
      <div className="text-2xl font-medium mb-2">PIN 입력</div>
      <div className="text-sm text-zinc-500 mb-10">대시보드 잠금 해제</div>

      <div className="flex gap-3 mb-6" aria-label="PIN 입력 상태">
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full transition-colors ${
              i < pin.length ? 'bg-white' : 'bg-[#2a2a2c]'
            }`}
          />
        ))}
      </div>

      <div className="h-6 mb-4 text-sm text-red-400" role="alert">{error}</div>

      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {KEYS.map(k => {
          if (k === 'clear') {
            return (
              <button
                key="clear"
                onClick={clear}
                disabled={busy || pin.length === 0}
                className="h-16 rounded-2xl text-sm text-zinc-400 disabled:opacity-30 active:bg-[#161618]"
              >
                지우기
              </button>
            );
          }
          if (k === 'back') {
            return (
              <button
                key="back"
                onClick={back}
                disabled={busy || pin.length === 0}
                className="h-16 rounded-2xl text-2xl text-zinc-400 disabled:opacity-30 active:bg-[#161618]"
                aria-label="한 자리 지우기"
              >
                ←
              </button>
            );
          }
          return (
            <button
              key={k}
              onClick={() => press(k)}
              disabled={busy}
              className="h-16 rounded-2xl bg-[#161618] text-2xl font-light tabular-nums active:bg-[#202024] disabled:opacity-50"
            >
              {k}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh]" />}>
      <LoginInner />
    </Suspense>
  );
}
