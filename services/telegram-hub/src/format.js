export function formatKst(d) {
  // invalid input 가드 — `new Date(undefined).getTime()` 은 NaN → "NaN/NaN NaN:NaN" 출력 회귀.
  const base = new Date(d).getTime();
  if (!Number.isFinite(base)) return '?';
  const x = new Date(base + 9 * 3600 * 1000);
  const M = String(x.getUTCMonth() + 1).padStart(2, '0');
  const D = String(x.getUTCDate()).padStart(2, '0');
  const h = String(x.getUTCHours()).padStart(2, '0');
  const m = String(x.getUTCMinutes()).padStart(2, '0');
  return `${M}/${D} ${h}:${m}`;
}

export function formatDur(min) {
  const n = Number(min || 0);
  if (n <= 0) return '0m';
  if (n < 60) return `${n}m`;
  const h = Math.floor(n / 60);
  const r = n % 60;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}
