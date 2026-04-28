// 임시 진단용 모듈 레벨 디버그 시스템 — useDriveData 같은 hook 내부의 lifecycle 을
// DriveMap 의 화면 오버레이에서 볼 수 있게 한다. 첫 진입 polyline 미표시 회귀가
// 해결되면 제거 예정.

const _events = [];
const _listeners = new Set();
let _t0 = null;

export function dbgLog(msg) {
  if (typeof performance === 'undefined') return;
  if (_t0 == null) _t0 = performance.now();
  const t = Math.round(performance.now() - _t0);
  _events.push(`${String(t).padStart(5)}ms ${msg}`);
  if (_events.length > 80) _events.splice(0, _events.length - 80);
  _listeners.forEach(fn => { try { fn(); } catch {} });
}

export function dbgRead() { return _events.slice(); }

export function dbgSubscribe(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
