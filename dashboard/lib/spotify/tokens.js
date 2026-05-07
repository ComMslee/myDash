// Spotify access_token 메모리 캐시 + 자동 갱신.
//
// refresh_token 출처: DB 우선 (lib/spotify/store.js), 없으면 .env (첫 부트스트랩).
// Spotify 가 refresh 응답에 새 refresh_token 을 주면 (rotation) 즉시 DB 에 저장.
// 재인증은 /dev/spotify-relogin 에서 1클릭으로 — SSH 불필요.

import { getRefreshToken, setRefreshToken } from '@/lib/spotify/store';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';

let cached = { accessToken: null, expiresAt: 0 };
let inflight = null;

function basicAuth() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error('SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET 환경변수 필요');
  }
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
}

async function fetchNewToken() {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    throw new Error('SPOTIFY_REFRESH_TOKEN 없음 — /dev/spotify-relogin 에서 재인증 필요');
  }

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuth(),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Spotify token refresh ${resp.status}: ${body}`);
  }

  const data = await resp.json();
  cached = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  // Spotify 가 refresh_token 을 rotation 하는 경우(가끔) — 새 값 즉시 영구 저장.
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    try { await setRefreshToken(data.refresh_token); } catch (e) {
      console.error('[spotify] refresh_token rotation 저장 실패:', e.message);
    }
  }

  return cached.accessToken;
}

export async function getAccessToken() {
  if (cached.accessToken && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }
  if (inflight) return inflight;
  inflight = fetchNewToken().finally(() => { inflight = null; });
  return inflight;
}

export function invalidateToken() {
  cached = { accessToken: null, expiresAt: 0 };
}

export function getTokenStatus() {
  return {
    hasToken: !!cached.accessToken,
    expiresAt: cached.expiresAt ? new Date(cached.expiresAt).toISOString() : null,
    secondsLeft: cached.expiresAt ? Math.max(0, Math.floor((cached.expiresAt - Date.now()) / 1000)) : 0,
  };
}
