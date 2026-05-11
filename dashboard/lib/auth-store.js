import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';

const DIR = process.env.AUTH_DATA_DIR || '/data';
const FILE = `${DIR}/auth.json`;
const SALT = 'myDash-auth-v1';

export async function readAuth() {
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeAuth(pin) {
  const token = await pinToken(pin);
  if (!existsSync(DIR)) await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(
    FILE,
    JSON.stringify({ token, updatedAt: Date.now() }),
    { mode: 0o600 },
  );
  return token;
}

export async function pinToken(pin) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(SALT));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
