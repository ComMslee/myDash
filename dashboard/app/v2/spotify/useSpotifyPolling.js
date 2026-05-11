'use client';

import { useEffect, useRef, useState } from 'react';

// 5초 폴링 — visibilitychange 연동, 탭 백그라운드면 정지.
// fetch 는 cookie 인증 자동 (same-origin), CSRF 불필요 (GET 만 사용).
export default function useSpotifyPolling(intervalMs = 5000) {
  const [state, setState] = useState({ loading: true, playing: false, error: null });
  const cancelRef = useRef(false);
  const timerRef = useRef(null);

  useEffect(() => {
    cancelRef.current = false;

    async function tick() {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        const resp = await fetch('/api/spotify/now-playing', { cache: 'no-store' });
        if (resp.status === 401 || resp.status === 412) {
          if (!cancelRef.current) setState({ loading: false, playing: false, error: 'auth' });
          return;
        }
        if (!resp.ok) {
          if (!cancelRef.current) setState(s => ({ ...s, loading: false, error: 'fetch' }));
          return;
        }
        const data = await resp.json();
        if (!cancelRef.current) setState({ loading: false, error: null, ...data });
      } catch {
        if (!cancelRef.current) setState(s => ({ ...s, loading: false, error: 'network' }));
      }
    }

    function start() {
      if (timerRef.current) return;
      tick();
      timerRef.current = setInterval(tick, intervalMs);
    }
    function stop() {
      if (!timerRef.current) return;
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    function onVis() {
      if (document.visibilityState === 'visible') { tick(); start(); }
      else stop();
    }

    start();
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelRef.current = true;
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [intervalMs]);

  // 외부에서 즉시 새로고침 (조작 후 호출)
  const refresh = () => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    fetch('/api/spotify/now-playing', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !cancelRef.current) setState({ loading: false, error: null, ...d }); })
      .catch(() => {});
  };

  return { ...state, refresh };
}
