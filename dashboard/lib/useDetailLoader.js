'use client';
import { useState, useCallback } from 'react';

export function useDetailLoader(url) {
  const [state, setState] = useState('idle'); // 'idle' | 'loading' | 'loaded' | 'error'
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    if (state !== 'idle') return;
    setState('loading');
    fetch(url)
      .then(r => r.json())
      .then(d => { setData(d); setState('loaded'); })
      .catch(() => setState('error'));
  }, [url, state]);

  return { data, state, load, isLoading: state === 'loading', isLoaded: state === 'loaded' };
}
