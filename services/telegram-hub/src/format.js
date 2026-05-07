export function formatKst(d) {
  const t = new Date(d).getTime() + 9 * 3600 * 1000;
  const x = new Date(t);
  const M = String(x.getUTCMonth() + 1).padStart(2, '0');
  const D = String(x.getUTCDate()).padStart(2, '0');
  const h = String(x.getUTCHours()).padStart(2, '0');
  const m = String(x.getUTCMinutes()).padStart(2, '0');
  return `${M}/${D} ${h}:${m}`;
}

export function formatDur(min) {
  const n = Number(min || 0);
  if (n <= 0) return '0분';
  if (n < 60) return `${n}분`;
  const h = Math.floor(n / 60);
  const r = n % 60;
  return r === 0 ? `${h}시간` : `${h}시간 ${r}분`;
}
