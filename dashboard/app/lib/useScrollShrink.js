'use client';

import { useEffect, useState } from 'react';

// 누적 방향 기반 히스테리시스 — iOS 모멘텀/러버밴드 잔 진동에서도 안정적.
// 단순 dy 임계값(±8px) 방식은 임계점 근처에서 방향이 뒤집히면 깜빡임 발생.
const SHRINK_AFTER = 60;     // 누적 다운 60px → 축소
const EXPAND_AFTER = 30;     // 누적 업 30px → 펼침
const EXPAND_AT_TOP = 24;    // 최상단 24px 이내면 무조건 펼침

export function useScrollShrink() {
  const [shrunk, setShrunk] = useState(false);
  useEffect(() => {
    let lastY = Math.max(0, window.scrollY);
    let accumDown = 0;
    let accumUp = 0;
    let ticking = false;
    const handler = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = Math.max(0, window.scrollY); // iOS 러버밴드 음수 방지
        const dy = y - lastY;
        lastY = y;

        if (y < EXPAND_AT_TOP) {
          setShrunk(false);
          accumDown = 0;
          accumUp = 0;
        } else if (dy > 0) {
          accumDown += dy;
          accumUp = 0;
          if (accumDown >= SHRINK_AFTER) {
            setShrunk(true);
            accumDown = 0;
          }
        } else if (dy < 0) {
          accumUp -= dy;
          accumDown = 0;
          if (accumUp >= EXPAND_AFTER) {
            setShrunk(false);
            accumUp = 0;
          }
        }
        ticking = false;
      });
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);
  return shrunk;
}
