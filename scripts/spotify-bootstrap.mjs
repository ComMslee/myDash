#!/usr/bin/env node
// 1회용 — 본인 Spotify 계정 OAuth 로 refresh_token 발급.
// 사용법:
//   SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy node scripts/spotify-bootstrap.mjs
//
// Spotify Developer 콘솔에서:
//   1) 앱 생성 → Client ID/Secret 복사
//   2) Redirect URIs 에 정확히 추가:  http://127.0.0.1:8765/callback
//
// 실행하면 브라우저가 열리고 Spotify 로그인/동의 후, 콘솔에 refresh_token 출력.
// 이 토큰을 .env 의 SPOTIFY_REFRESH_TOKEN 에 박제하면 됨 (영원히 자동 갱신).

import http from 'node:http';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = 'http://127.0.0.1:8765/callback';
const PORT = 8765;

const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-library-read',
  'user-library-modify',
  'user-read-recently-played',
].join(' ');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌  SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET 환경변수 필요');
  console.error('    예: SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy node scripts/spotify-bootstrap.mjs');
  process.exit(1);
}

// ---- PKCE ----
function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const codeVerifier = b64url(crypto.randomBytes(48));
const codeChallenge = b64url(crypto.createHash('sha256').update(codeVerifier).digest());
const state = b64url(crypto.randomBytes(16));

const authUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
  client_id: CLIENT_ID,
  response_type: 'code',
  redirect_uri: REDIRECT_URI,
  scope: SCOPES,
  state,
  code_challenge_method: 'S256',
  code_challenge: codeChallenge,
  show_dialog: 'true',
}).toString();

// ---- Callback Server ----
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname !== '/callback') {
    res.writeHead(404).end('not found');
    return;
  }

  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const errParam = url.searchParams.get('error');

  if (errParam) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
       .end(`Spotify OAuth 거부: ${errParam}`);
    console.error(`\n❌  거부됨: ${errParam}`);
    server.close();
    process.exit(1);
  }
  if (returnedState !== state) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
       .end('state mismatch (CSRF 의심)');
    console.error('\n❌  state 불일치 — 다시 시도');
    server.close();
    process.exit(1);
  }

  try {
    const tokenResp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // 컨피덴셜 클라이언트라 Basic Auth 도 사용 가능. PKCE 와 병행 OK.
        Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenResp.ok) {
      const body = await tokenResp.text();
      throw new Error(`token exchange ${tokenResp.status}: ${body}`);
    }

    const data = await tokenResp.json();
    const refreshToken = data.refresh_token;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
       .end(`<!doctype html><meta charset=utf-8><body style="background:#0f0f0f;color:#e5e5e5;font-family:system-ui;padding:48px;text-align:center"><h1 style="color:#1DB954">✅ 발급 완료</h1><p>터미널 콘솔을 확인해 .env 에 박제하세요.</p><p style="color:#777;font-size:13px">이 창은 닫으셔도 됩니다.</p></body>`);

    console.log('\n========================================');
    console.log('✅  Spotify refresh_token 발급 완료');
    console.log('========================================\n');
    console.log('아래 줄을 .env 파일에 그대로 추가:\n');
    console.log(`SPOTIFY_CLIENT_ID=${CLIENT_ID}`);
    console.log(`SPOTIFY_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`SPOTIFY_REFRESH_TOKEN=${refreshToken}`);
    console.log('\n----------------------------------------');
    console.log(`scope: ${data.scope}`);
    console.log(`expires_in: ${data.expires_in}s (access_token, 자동 갱신됨)`);
    console.log('========================================\n');

    server.close();
    setTimeout(() => process.exit(0), 100);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
       .end(`token exchange 실패: ${err.message}`);
    console.error('\n❌  token exchange 실패:', err.message);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n🎵  Spotify OAuth 시작 — 브라우저가 자동으로 열립니다.\n`);
  console.log(`(안 열리면 직접 이 URL 을 복사해 브라우저에 붙여넣으세요:)\n`);
  console.log(authUrl);
  console.log(`\n콜백 대기 중: ${REDIRECT_URI}\n`);

  // 플랫폼별 브라우저 자동 열기 (실패해도 URL 출력했으니 OK)
  const opener = process.platform === 'darwin' ? 'open'
               : process.platform === 'win32' ? 'start ""'
               : 'xdg-open';
  exec(`${opener} "${authUrl}"`, () => {});
});

// 5분 타임아웃 — 사용자가 무시한 경우 깔끔히 종료
setTimeout(() => {
  console.error('\n⏱   5분 타임아웃 — 다시 실행해 주세요.');
  server.close();
  process.exit(1);
}, 5 * 60 * 1000).unref();
