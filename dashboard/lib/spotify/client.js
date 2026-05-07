// Spotify Web API 호출 래퍼 + 모든 엔드포인트 헬퍼.
// 모든 API 라우트는 이 파일을 통해서만 fetch — 토큰/401/에러 처리 일원화.
//
// 참고: 원래 chrome 확장의 spotify-api.js 를 서버사이드로 포팅
//      (chrome.storage → 모듈 메모리, browser fetch → Node fetch).

import { getAccessToken, invalidateToken } from './tokens.js';

const API_BASE = 'https://api.spotify.com/v1';

// ---- Fetch Wrapper ----

export async function spotifyFetch(endpoint, options = {}) {
  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}` };
  if (options.body) headers['Content-Type'] = 'application/json';

  const url = `${API_BASE}${endpoint}`;
  let resp = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });

  // 401 → 토큰 무효화 후 1회 재시도
  if (resp.status === 401) {
    invalidateToken();
    const newToken = await getAccessToken();
    const retryHeaders = { Authorization: `Bearer ${newToken}` };
    if (options.body) retryHeaders['Content-Type'] = 'application/json';
    resp = await fetch(url, { ...options, headers: { ...retryHeaders, ...options.headers } });
  }
  return resp;
}

// ---- Playback ----

export async function getCurrentPlayback() {
  // /me/player 가 디바이스 + 트랙 모두 포함 (currently-playing 보다 정보 풍부)
  const resp = await spotifyFetch('/me/player');
  if (resp.status === 204) return null; // 재생 중인 디바이스 없음
  if (!resp.ok) return null;
  return resp.json();
}

const CONTROL_MAP = {
  play:     { endpoint: '/me/player/play',     method: 'PUT'  },
  pause:    { endpoint: '/me/player/pause',    method: 'PUT'  },
  next:     { endpoint: '/me/player/next',     method: 'POST' },
  previous: { endpoint: '/me/player/previous', method: 'POST' },
};

export async function controlPlayback(action) {
  const cfg = CONTROL_MAP[action];
  if (!cfg) return { ok: false, status: 400, error: 'invalid_action' };
  const resp = await spotifyFetch(cfg.endpoint, { method: cfg.method });
  if (resp.ok || resp.status === 204) return { ok: true };
  const body = await resp.text().catch(() => '');
  return { ok: false, status: resp.status, error: body };
}

export async function seekToPosition(positionMs) {
  const ms = Math.max(0, Math.round(positionMs));
  const resp = await spotifyFetch(`/me/player/seek?position_ms=${ms}`, { method: 'PUT' });
  if (resp.ok || resp.status === 204) return { ok: true };
  const body = await resp.text().catch(() => '');
  return { ok: false, status: resp.status, error: body };
}

// ---- Favorites ----

export async function checkIsFavorite(trackId) {
  const uri = `spotify:track:${trackId}`;
  const resp = await spotifyFetch(`/me/library/contains?uris=${encodeURIComponent(uri)}`);
  if (!resp.ok) return false;
  const data = await resp.json();
  return data[0] === true;
}

export async function checkIsFavoriteBatch(trackIds) {
  if (!trackIds.length) return {};
  const uris = trackIds.map(id => `spotify:track:${id}`).join(',');
  const resp = await spotifyFetch(`/me/library/contains?uris=${encodeURIComponent(uris)}`);
  if (!resp.ok) return Object.fromEntries(trackIds.map(id => [id, false]));
  const data = await resp.json();
  return Object.fromEntries(trackIds.map((id, i) => [id, data[i] === true]));
}

export async function toggleFavorite(trackId, currentlyFavorite) {
  const method = currentlyFavorite ? 'DELETE' : 'PUT';
  const uri = `spotify:track:${trackId}`;
  const resp = await spotifyFetch(`/me/library?uris=${encodeURIComponent(uri)}`, { method });
  if (resp.ok || resp.status === 204) return { ok: true, isFavorite: !currentlyFavorite };
  const body = await resp.text().catch(() => '');
  return { ok: false, status: resp.status, error: body };
}

// ---- Queue / Recent ----

export async function getQueue() {
  const resp = await spotifyFetch('/me/player/queue');
  if (!resp.ok) return { queue: [] };
  const data = await resp.json();
  return {
    queue: (data.queue || [])
      .filter(t => t?.type === 'track')
      .map(t => ({
        uri: t.uri,
        trackId: t.id,
        name: t.name,
        artist: (t.artists || []).map(a => a.name).join(', '),
        durationMs: t.duration_ms,
      })),
  };
}

export async function getRecentlyPlayed(limit = 50) {
  const cap = Math.max(1, Math.min(50, limit));
  const resp = await spotifyFetch(`/me/player/recently-played?limit=${cap}`);
  if (!resp.ok) return { items: [] };
  const data = await resp.json();
  const items = (data.items || [])
    .filter(i => i.track?.type === 'track')
    .map(i => ({
      trackId: i.track.id,
      uri: i.track.uri,
      name: i.track.name,
      artist: (i.track.artists || []).map(a => a.name).join(', '),
      albumArt: i.track.album?.images?.at(-1)?.url || '',
      durationMs: i.track.duration_ms,
      playedAt: i.played_at, // ISO string
      contextType: i.context?.type || null, // 'playlist' | 'album' | null
    }));
  return { items };
}

export async function playTrack(uri) {
  const resp = await spotifyFetch('/me/player/play', {
    method: 'PUT',
    body: JSON.stringify({ uris: [uri] }),
  });
  if (resp.ok || resp.status === 204) return { ok: true };
  const body = await resp.text().catch(() => '');
  return { ok: false, status: resp.status, error: body };
}

// ---- Devices ----

export async function getDevices() {
  const resp = await spotifyFetch('/me/player/devices');
  if (!resp.ok) return { devices: [] };
  const data = await resp.json();
  return {
    devices: (data.devices || []).map(d => ({
      id: d.id,
      name: d.name,
      type: d.type, // 'Computer' | 'Smartphone' | 'Speaker' | 'AVR' | 'Automobile' | ...
      isActive: d.is_active,
      isPrivateSession: d.is_private_session,
      volumePercent: d.volume_percent,
    })),
  };
}

// ---- 차량 디바이스 식별 ----
// Spotify 의 device.type 이 'Automobile' 인 경우 / 이름에 Tesla|Model 포함 시 차량으로 간주.
export function isVehicleDevice(device) {
  if (!device) return false;
  if (device.type === 'Automobile') return true;
  const name = (device.name || '').toLowerCase();
  return /tesla|model[\s-]?[sxy3]/i.test(name);
}
