import fs from 'node:fs';
import path from 'node:path';

const STATE_DIR = process.env.STATE_DIR || '/data';
const STATE_FILE = path.join(STATE_DIR, 'state.json');

const DEFAULT = {
  last_charge_start_id: 0,
  last_charge_end_id: 0,
  last_drive_end_id: 0,
  telegram_offset: 0,
};

let state = { ...DEFAULT };

export function loadState() {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    if (fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      state = { ...DEFAULT, ...raw };
    }
  } catch (e) {
    console.error('[state] load failed', e);
  }
  return state;
}

export function getState() {
  return state;
}

export function setState(patch) {
  state = { ...state, ...patch };
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('[state] save failed', e);
  }
}
