import http from 'node:http';
import crypto from 'node:crypto';
import { sendMessage } from './telegram.js';
import { getState } from './state.js';

const SECRET = process.env.HUB_SHARED_SECRET || '';
const PORT = Number(process.env.PORT || 3000);
const BOOTED_AT = Date.now();
const MAX_BODY = 1e5;

// timing-safe Bearer 검증. 길이 다르면 timingSafeEqual 자체가 throw 하므로 가드.
function checkAuth(req) {
  if (!SECRET) return true;
  const auth = req.headers.authorization || '';
  const expected = `Bearer ${SECRET}`;
  const a = Buffer.from(auth);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

export function startHttpServer() {
  const srv = http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        uptime_sec: Math.round((Date.now() - BOOTED_AT) / 1000),
        state: getState(),
      }));
      return;
    }
    if (req.method !== 'POST' || req.url !== '/notify') {
      res.writeHead(404);
      res.end();
      return;
    }
    if (!checkAuth(req)) {
      res.writeHead(401);
      res.end('unauthorized');
      return;
    }
    let body = '';
    let oversized = false;
    req.on('data', (c) => {
      if (oversized) return;
      body += c;
      if (body.length > MAX_BODY) {
        // 413 명시 후 destroy — 클라가 truncated body 응답을 hang 으로 받지 않게.
        oversized = true;
        res.writeHead(413);
        res.end('payload too large');
        req.destroy();
      }
    });
    req.on('end', async () => {
      if (oversized) return;
      try {
        const j = JSON.parse(body || '{}');
        if (!j.text) {
          res.writeHead(400);
          res.end('text required');
          return;
        }
        const r = await sendMessage(j.text, j.chat_id);
        res.writeHead(r ? 200 : 502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: !!r }));
      } catch (e) {
        // raw error message 를 클라이언트에 노출하지 않음 — 진단은 로그만.
        console.error('[notify] handler', e?.message || e);
        res.writeHead(500);
        res.end('internal error');
      }
    });
  });
  srv.listen(PORT, () => console.log(`[notify] listening on :${PORT}`));
}
