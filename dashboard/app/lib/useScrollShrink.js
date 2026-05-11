'use client';

import { useEffect, useState } from 'react';

// 누적 방향 기반 히스테리시스 — iOS 모멘텀/러버밴드 잔 진동에서도 안정적.
// 단순 dy 임계값(±8px) 방식은 임계점 근처에서 방향이 뒤집히면 깜빡임 발생.
const SHRINK_AFTER = 60;       // 누적 다운 60px → 축소
const EXPAND_AFTER = 30;       // 누적 업 30px → 펼침
const EXPAND_AT_TOP = 24;      // 최상단 24px 이내면 무조건 펼침
const BOTTOM_DEAD_ZONE = 48;   // 최하단 48px 이내는 dy 무시 — iOS Safari rubber-band 가 음수 dy 를 만들어 expand 오발 방지

export function useScrollShrink() {
  const [shrunk, setShrunk] = useState(false);
  useEffect(() => {
    let lastTarget = null;
    let lastY = Math.max(0, window.scrollY);
    let accumDown = 0;
    let accumUp = 0;
    let ticking = false;

    // 페이지에 따라 스크롤 컨테이너가 다름 — window(일반) / 내부 div(history 처럼 body 락된 페이지).
    // capture: true 로 descendant scroll 도 잡아 단일 훅으로 통합 처리.
    const readPos = (t) => {
      if (t === document || t === window || !t || typeof t.scrollTop !== 'number') {
        return {
          y: Math.max(0, window.scrollY),
          maxY: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
        };
      }
      return {
        y: Math.max(0, t.scrollTop),
        maxY: Math.max(0, t.scrollHeight - t.clientHeight),
      };
    };

    const handler = (e) => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const t = e.target;
        const { y, maxY } = readPos(t);

        // 스크롤 소스 전환 — 누적 리셋해서 잔여 dy 가 오발하지 않게.
        if (t !== lastTarget) {
          lastTarget = t;
          lastY = y;
          accumDown = 0;
          accumUp = 0;
          ticking = false;
          return;
        }

        const dy = y - lastY;
        lastY = y;
        const atBottom = maxY > 0 && y >= maxY - BOTTOM_DEAD_ZONE;

        if (y < EXPAND_AT_TOP) {
          setShrunk(false);
          accumDown = 0;
          accumUp = 0;
        } else if (atBottom) {
          // 페이지 끝 — rubber-band 진동 흡수. 상태 유지, 누적 리셋.
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
    window.addEventListener('scroll', handler, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', handler, { capture: true });
  }, []);
  return shrunk;
}
