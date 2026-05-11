// 순수 포맷 함수 + 작은 시간 헬퍼 — 부수효과 없는 변환만

export function fmtElapsed(min) {
  if (!Number.isFinite(min) || min < 0) return '?';
  return min >= 60
    ? `${Math.floor(min / 60)}시간 ${min % 60}분`
    : `${min}분`;
}

export function fmtSecHm(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '?';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h >= 1) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  return `${m}분`;
}

export function ymdKstNow(offsetDays = 0) {
  const t = Date.now() + 9 * 3600 * 1000 + offsetDays * 24 * 3600 * 1000;
  const x = new Date(t);
  const Y = x.getUTCFullYear();
  const M = String(x.getUTCMonth() + 1).padStart(2, '0');
  const D = String(x.getUTCDate()).padStart(2, '0');
  return `${Y}${M}${D}`;
}

export function weekendRangeKst() {
  const t = Date.now() + 9 * 3600 * 1000;
  const dow = new Date(t).getUTCDay(); // 0=Sun, 6=Sat
  // 일요일은 그날만, 평일은 다음 금~일, 금/토는 오늘~일.
  let fromOff, toOff;
  if (dow === 0)              { fromOff = 0;       toOff = 0; }
  else if (dow >= 1 && dow <= 4) { fromOff = 5 - dow; toOff = 7 - dow; }
  else                          { fromOff = 0;       toOff = 7 - dow; }
  return { from: ymdKstNow(fromOff), to: ymdKstNow(toOff) };
}

export function fmtYmdShort(s) {
  if (typeof s !== 'string' || !/^\d{8}$/.test(s)) return s || '?';
  return `${Number(s.slice(4, 6))}/${Number(s.slice(6, 8))}`;
}

export function fmtFestivalDates(start, end) {
  const s = fmtYmdShort(start);
  const e = fmtYmdShort(end);
  if (!start || !end || start === end) return s;
  return `${s}~${e}`;
}
