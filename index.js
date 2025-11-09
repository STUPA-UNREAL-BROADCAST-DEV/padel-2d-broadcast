const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'state.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const REMOTE_SOURCE_URL = process.env.REMOTE_SOURCE_URL || 'https://script.google.com/macros/s/AKfycbyK0B901Wx5sq4AWvidmDVB993DM7B4kB5eomDwl_QjGAlqukWSCTK7aOyw65UDKEMo/exec';
const REMOTE_POLL_MS = Number(process.env.REMOTE_POLL_MS || 1000);

const defaultState = {
  set_label: '',
  current_game: 1,
  rally_count: 0,
  player_a_name: 'Player A',
  player_a_serve_success: 0,
  player_a_forehand_wins: 0,
  player_a_backhand_wins: 0,
  player_b_name: 'Player B',
  player_b_serve_success: 0,
  player_b_forehand_wins: 0,
  player_b_backhand_wins: 0,
  singlebar_visible: true,
  doublebar_visible: true,
  doublebar_metric: 'serve_success'
};

if (!fs.existsSync(DATA_FILE)) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(defaultState, null, 2), 'utf8');
}

function extractRemoteState(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const payload = raw.row && typeof raw.row === 'object' ? raw.row : raw;
  const normalized = {};

  Object.keys(defaultState).forEach((key) => {
    if (payload[key] !== undefined && payload[key] !== null) {
      normalized[key] = payload[key];
    }
  });

  return Object.keys(normalized).length ? normalized : null;
}

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

const allowedKeys = new Set([
  'set_label',
  'current_game',
  'rally_count',
  'player_a_name',
  'player_a_serve_success',
  'player_a_forehand_wins',
  'player_a_backhand_wins',
  'player_b_name',
  'player_b_serve_success',
  'player_b_forehand_wins',
  'player_b_backhand_wins',
  'singlebar_visible',
  'doublebar_visible',
  'doublebar_metric'
]);

function readState() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...defaultState, ...parsed };
  } catch (error) {
    console.error('Failed to read state file. Falling back to defaults.', error);
    return { ...defaultState };
  }
}

let state = readState();

function writeState(nextState) {
  state = nextState;
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
}

app.get('/controller', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'controller.html'));
});

app.get('/singlebar', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'singlebar.html'));
});

app.get('/doublebar', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'doublebar.html'));
});

app.get('/api/state', (req, res) => {
  const current = readState();
  state = current;
  res.json(current);
});

app.post('/api/state', (req, res) => {
  const body = req.body || {};
  const latest = readState();
  const updated = { ...latest };

  Object.entries(body).forEach(([key, value]) => {
    if (!allowedKeys.has(key)) {
      return;
    }

    updated[key] = value;
  });

  writeState(updated);
  res.json(updated);
});

async function pollRemoteState() {
  if (!REMOTE_SOURCE_URL) {
    return;
  }

  try {
    const response = await fetch(REMOTE_SOURCE_URL, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const remoteJson = await response.json();
    const remoteState = extractRemoteState(remoteJson);
    if (!remoteState) {
      return;
    }

    const currentState = readState();
    const nextState = { ...currentState, ...remoteState };

    if (JSON.stringify(currentState) !== JSON.stringify(nextState)) {
      writeState(nextState);
    }
  } catch (error) {
    console.warn('Remote poll failed:', error.message);
  }
}

if (REMOTE_SOURCE_URL) {
  pollRemoteState();
  setInterval(pollRemoteState, REMOTE_POLL_MS);
}

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

