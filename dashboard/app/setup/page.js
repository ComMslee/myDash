'use client';

import { Suspense, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

const PIN_LENGTH = 6;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];

function SetupInner() {
  const router = useRouter();
  const [step, setStep] = useState('enter'); // enter | confirm | busy
  const [pin, setPin] = useState('');
  const [first, setFirst] = useState('');
  const [error, setError] = useState('');

  const submit = useCallback(async (firstPin) => {
    setStep('busy');
    setError('');
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin: firstPin }),
      });
      if (res.ok) {
        router.replace('/');
        router.refresh();
        return;
      }
      const j = await res.json().catch(() => ({}));
      if (res.status === 409) setError('이미 PIN 이 등록되어 있습니다');
      else setError(`등록 실패 — ${j.error || res.status}`);
      setStep('enter');
      setFirst('');
      setPin('');
    } catch {
      setError('네트워크 오류');
      setStep('enter');
      setFirst('');
      setPin('');
    }
  }, [router]);

  const press = (digit) => {
    if (step === 'busy') return;
    setError('');
    if (pin.length >= PIN_LENGTH) return;
    const v = pin + digit;
    setPin(v);
    if (v.length === PIN_LENGTH) {
      if (step === 'enter') {
        setFirst(v);
        setPin('');
        setStep('confirm');
      } else {
        if (v !== first) {
          setError('PIN 이 일치하지 않습니다 — 처음부터 다시');
          setFirst('');
          setPin('');
          setStep('enter');
          return;
        }
        submit(v);
      }
    }
  };

  const back = () => {
    if (step === 'busy') return;
    setError('');
    setPin(p => p.slice(0, -1));
  };

  const clear = () => {
    if (step === 'busy') return;
    setError('');
    setPin('');
  };

  const title = step === 'enter' ? 'PIN 등록' : step === 'confirm' ? 'PIN 다시 입력' : '등록 중...';
  const subtitle = step === 'enter' ? '대시보드 잠금에 사용할 6자리 숫자' : step === 'confirm' ? '확인을 위해 한 번 더' : '';

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-10">
      <div className="text-2xl font-medium mb-2">{title}</div>
      <div className="text-sm text-zinc-500 mb-10">{subtitle}</div>

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
                disabled={step === 'busy' || pin.length === 0}
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
                disabled={step === 'busy' || pin.length === 0}
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
              disabled={step === 'busy'}
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

export default function SetupPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh]" />}>
      <SetupInner />
    </Suspense>
  );
}
