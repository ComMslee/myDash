import http from 'node:http';
import { sendMessage } from './telegram.js';
import { getState } from './state.js';

const SECRET = process.env.HUB_SHARED_SECRET || '';
const PORT = Number(process.env.PORT || 3000);
const BOOTED_AT = Date.now();

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
    if (SECRET) {
      const auth = req.headers.authorization || '';
      if (auth !== `Bearer ${SECRET}`) {
        res.writeHead(401);
        res.end('unauthorized');
        return;
      }
    }
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 1e5) {
        req.destroy();
      }
    });
    req.on('end', async () => {
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
        res.writeHead(500);
        res.end(String(e?.message || e));
      }
    });
  });
  srv.listen(PORT, () => console.log(`[notify] listening on :${PORT}`));
}
