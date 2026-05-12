// /v2/dev/api-status 페이지 공용 유틸 — page.js 에서 import.

export const SLOW_MS = 1500;

export function buildQS(params, values) {
  if (!params?.length) return '';
  const usp = new URLSearchParams();
  for (const p of params) {
    const v = values?.[p.key];
    if (v != null && v !== '') usp.set(p.key, v);
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export function summarizePayload(text) {
  if (!text) return { kind: 'empty', hint: '—', peek: '', parsed: null };
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    return { kind: 'text', hint: `${text.length}자`, peek: text.slice(0, 500), parsed: null };
  }
  let hint = '';
  if (Array.isArray(parsed)) {
    hint = `${parsed.length}행`;
  } else if (parsed && typeof parsed === 'object') {
    const keys = Object.keys(parsed);
    if ('error' in parsed) hint = `error: ${String(parsed.error).slice(0, 40)}`;
    else hint = `${keys.length}키`;
  } else {
    hint = String(parsed).slice(0, 30);
  }
  let peek;
  try { peek = JSON.stringify(parsed, null, 2).slice(0, 800); }
  catch { peek = text.slice(0, 800); }
  return { kind: 'json', hint, peek, parsed };
}
