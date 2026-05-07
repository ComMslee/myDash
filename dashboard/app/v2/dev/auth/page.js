'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

const PIN_LENGTH = 6;

function PinDots({ count }) {
  return (
    <div className="flex gap-2 justify-center my-2">
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <div
          key={i}
          className={`w-2.5 h-2.5 rounded-full transition-colors ${
            i < count ? 'bg-white' : 'bg-[#2a2a2c]'
          }`}
        />
      ))}
    </div>
  );
}

function NumPad({ onDigit, onBack, onClear, disabled }) {
  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];
  return (
    <div className="grid grid-cols-3 gap-2 w-full max-w-[260px] mx-auto mt-3">
      {KEYS.map(k => {
        if (k === 'clear') {
          return (
            <button
              key="clear"
              onClick={onClear}
              disabled={disabled}
              className="h-12 rounded-xl text-xs text-zinc-400 disabled:opacity-30 active:bg-[#161618]"
            >지우기</button>
          );
        }
        if (k === 'back') {
          return (
            <button
              key="back"
              onClick={onBack}
              disabled={disabled}
              className="h-12 rounded-xl text-xl text-zinc-400 disabled:opacity-30 active:bg-[#161618]"
              aria-label="한 자리 지우기"
            >←</button>
          );
        }
        return (
          <button
            key={k}
            onClick={() => onDigit(k)}
            disabled={disabled}
            className="h-12 rounded-xl bg-[#161618] text-xl tabular-nums active:bg-[#202024] disabled:opacity-50"
          >{k}</button>
        );
      })}
    </div>
  );
}

export default function AuthPage() {
  const router = useRouter();
  const [step, setStep] = useState('current'); // current | new | confirm | busy
  const [current, setCurrent] = useState('');
  const [pin, setPin] = useState('');
  const [first, setFirst] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const submit = useCallback(async (currentPin, newPin) => {
    setStep('busy');
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/auth/change', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPin, newPin }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setSuccess('PIN 변경 완료. 다른 디바이스는 다시 로그인 필요.');
        setCurrent('');
        setFirst('');
        setPin('');
        setStep('current');
        return;
      }
      if (res.status === 401) setError('현재 PIN 이 올바르지 않습니다');
      else setError(`변경 실패 — ${j.error || res.status}`);
      setCurrent('');
      setFirst('');
      setPin('');
      setStep('current');
    } catch {
      setError('네트워크 오류');
      setStep('current');
    }
  }, []);

  const press = (digit) => {
    if (step === 'busy') return;
    setError('');
    setSuccess('');
    const target = step === 'current' ? current : pin;
    if (target.length >= PIN_LENGTH) return;
    const v = target + digit;
    if (step === 'current') {
      setCurrent(v);
      if (v.length === PIN_LENGTH) {
        setPin('');
        setStep('new');
      }
    } else if (step === 'new') {
      setPin(v);
      if (v.length === PIN_LENGTH) {
        setFirst(v);
        setPin('');
        setStep('confirm');
      }
    } else {
      setPin(v);
      if (v.length === PIN_LENGTH) {
        if (v !== first) {
          setError('새 PIN 이 일치하지 않습니다 — 다시');
          setFirst('');
          setPin('');
          setStep('new');
          return;
        }
        submit(current, v);
      }
    }
  };

  const back = () => {
    if (step === 'busy') return;
    setError('');
    if (step === 'current') setCurrent(c => c.slice(0, -1));
    else setPin(p => p.slice(0, -1));
  };

  const clear = () => {
    if (step === 'busy') return;
    setError('');
    if (step === 'current') setCurrent('');
    else setPin('');
  };

  const logout = useCallback(async () => {
    await fetch('/api/logout', { method: 'POST' }).catch(() => null);
    router.replace('/login');
    router.refresh();
  }, [router]);

  const title = {
    current: '현재 PIN 입력',
    new: '새 PIN 입력',
    confirm: '새 PIN 다시 입력',
    busy: '변경 중...',
  }[step];

  const visibleCount = step === 'current' ? current.length : pin.length;

  return (
    <div className="min-h-[100dvh] max-w-md mx-auto px-4 py-6">
      <div className="text-xs text-zinc-500 mb-2">/v2/dev/auth</div>
      <div className="text-xl font-medium mb-6">인증 설정</div>

      <section className="bg-[#161618] rounded-2xl p-5 mb-4">
        <div className="text-sm font-medium mb-1">PIN 변경</div>
        <div className="text-xs text-zinc-500 mb-3">{title}</div>

        <PinDots count={visibleCount} />

        <div className="h-5 text-xs text-red-400 text-center" role="alert">{error}</div>
        <div className="h-5 text-xs text-emerald-400 text-center">{success}</div>

        <NumPad
          onDigit={press}
          onBack={back}
          onClear={clear}
          disabled={step === 'busy'}
        />
      </section>

      <section className="bg-[#161618] rounded-2xl p-5">
        <div className="text-sm font-medium mb-1">로그아웃</div>
        <div className="text-xs text-zinc-500 mb-3">이 디바이스의 쿠키를 제거합니다</div>
        <button
          onClick={logout}
          className="w-full h-11 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 text-sm font-medium active:bg-red-500/30"
        >
          로그아웃
        </button>
      </section>
    </div>
  );
}
