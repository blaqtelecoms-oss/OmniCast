import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = process.env.DATA_DIR || './.data';
const DATA_FILE = path.join(DATA_DIR, 'beam.json');
const ROOM_TTL_MS = 30 * 60 * 1000;
const PEER_TTL_MS = 25 * 1000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

fs.mkdirSync(DATA_DIR, { recursive: true });

/* ------------------------------------------------------------------ storage */

const emptyDb = () => ({ users: [], devices: [], sessions: {}, resets: {}, challenges: {} });

const loadDb = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return { ...emptyDb(), ...parsed };
  } catch {
    return emptyDb();
  }
};

const db = loadDb();
let saveTimer = null;

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    } catch (err) {
      console.error('[beam-api] could not persist state:', err.message);
    }
  }, 120);
}

/* ------------------------------------------------------------------- crypto */

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => ({
  salt,
  hash: crypto.scryptSync(password, salt, 64).toString('hex'),
});

const passwordMatches = (password, user) => {
  const derived = Buffer.from(hashPassword(password, user.salt).hash, 'hex');
  const stored = Buffer.from(user.hash, 'hex');
  return derived.length === stored.length && crypto.timingSafeEqual(derived, stored);
};

const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  mfa_enabled: Boolean(user.mfaEnabled),
});

const randomCode = () => {
  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return code;
};

const newToken = () => crypto.randomBytes(24).toString('hex');

function createSession(user) {
  const token = newToken();
  db.sessions[token] = { userId: user.id, createdAt: new Date().toISOString() };
  save();
  return token;
}

/* ---------------------------------------------------------------- seed data */

function seed() {
  if (!db.users.length) {
    const { salt, hash } = hashPassword('demo1234');
    const user = {
      id: 'usr_demo',
      email: 'demo@beam.app',
      name: 'Alex Rivera',
      salt,
      hash,
      mfaEnabled: false,
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);

    const now = Date.now();
    db.devices.push(
      {
        id: 'dev_studio',
        userId: user.id,
        name: 'Studio iMac',
        platform: 'macos',
        status: 'paired',
        pairCode: 'M4C9T2',
        lastSeen: new Date(now - 4 * 60 * 1000).toISOString(),
        createdAt: new Date(now - 26 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'dev_living',
        userId: user.id,
        name: 'Living room mini',
        platform: 'linux',
        status: 'paired',
        pairCode: 'L7X3K8',
        lastSeen: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'dev_reception',
        userId: user.id,
        name: 'Front desk PC',
        platform: 'windows',
        status: 'pending',
        pairCode: 'W2B6N4',
        lastSeen: null,
        requestedAt: new Date(now - 12 * 60 * 1000).toISOString(),
        createdAt: new Date(now - 12 * 60 * 1000).toISOString(),
      }
    );
    save();
  }
}

seed();

/* --------------------------------------------------------------------- app */

const app = express();
app.use(express.json({ limit: '1mb' }));

const rooms = new Map();

const auth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const session = token ? db.sessions[token] : null;
  const user = session ? db.users.find((entry) => entry.id === session.userId) : null;
  if (!user) {
    res.status(401).json({ message: 'Sign in to continue.' });
    return;
  }
  req.user = user;
  next();
};

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size, users: db.users.length });
});

app.get('/api/app-public-settings', (_req, res) => {
  res.json({
    id: 'beam',
    name: 'Beam',
    requiresAuth: true,
    allowRegistration: true,
    mfaEnabled: false,
  });
});

/* -------------------------------------------------------------------- auth */

app.post('/api/auth/register', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email.includes('@')) return res.status(400).json({ message: 'That email does not look right.' });
  if (password.length < 8) return res.status(400).json({ message: 'Use at least 8 characters.' });
  if (db.users.some((user) => user.email === email)) {
    return res.status(409).json({ message: 'An account already uses that email.' });
  }

  const { salt, hash } = hashPassword(password);
  const user = {
    id: `usr_${crypto.randomBytes(6).toString('hex')}`,
    email,
    name: name || email.split('@')[0],
    salt,
    hash,
    mfaEnabled: false,
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  save();

  return res.status(201).json({ token: createSession(user), user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = db.users.find((entry) => entry.email === email);

  if (!user || !passwordMatches(password, user)) {
    return res.status(401).json({ message: 'Email or password is incorrect.' });
  }

  if (user.mfaEnabled) {
    const challenge = newToken();
    db.challenges[challenge] = { userId: user.id, createdAt: Date.now() };
    save();
    return res.json({ mfaRequired: true, challenge });
  }

  return res.json({ token: createSession(user), user: publicUser(user) });
});

app.post('/api/auth/mfa', (req, res) => {
  const challenge = String(req.body?.challenge || '');
  const code = String(req.body?.code || '').trim();
  const record = db.challenges[challenge];
  if (!record) return res.status(400).json({ message: 'Start the sign-in again.' });
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ message: 'Enter the six-digit code.' });

  const user = db.users.find((entry) => entry.id === record.userId);
  delete db.challenges[challenge];
  save();
  if (!user) return res.status(400).json({ message: 'Start the sign-in again.' });
  return res.json({ token: createSession(user), user: publicUser(user) });
});

app.get('/api/auth/me', auth, (req, res) => {
  res.json(publicUser(req.user));
});

app.post('/api/auth/forgot-password', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const user = db.users.find((entry) => entry.email === email);
  const payload = { ok: true };

  if (user) {
    const token = newToken();
    db.resets[token] = { userId: user.id, createdAt: Date.now() };
    save();
    // No mail transport in this build: surface the link so the flow can be walked.
    payload.devResetToken = token;
  }

  res.json(payload);
});

app.post('/api/auth/reset-password', (req, res) => {
  const token = String(req.body?.token || '');
  const password = String(req.body?.password || '');
  const record = db.resets[token];
  const user = record ? db.users.find((entry) => entry.id === record.userId) : null;

  if (!user) return res.status(400).json({ message: 'That reset link is no longer valid.' });
  if (password.length < 8) return res.status(400).json({ message: 'Use at least 8 characters.' });

  const { salt, hash } = hashPassword(password);
  user.salt = salt;
  user.hash = hash;
  delete db.resets[token];
  save();
  return res.json({ ok: true });
});

/* ----------------------------------------------------------------- devices */

const ownedDevice = (user, id) => db.devices.find((device) => device.id === id && device.userId === user.id);

app.get('/api/devices', auth, (req, res) => {
  const mine = db.devices.filter((device) => device.userId === req.user.id);
  res.json({
    devices: mine.filter((device) => device.status === 'paired'),
    pending: mine.filter((device) => device.status === 'pending'),
  });
});

app.post('/api/devices/pair', auth, (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return res.status(400).json({ message: 'Pairing codes are six letters or digits.' });
  }

  const existing = db.devices.find((device) => device.pairCode === code && device.userId === req.user.id);
  if (existing) return res.status(409).json({ message: 'That code is already in use here.' });

  const requestedName = String(req.body?.name || '').trim();
  const platform = code.startsWith('M') ? 'macos' : code.startsWith('L') ? 'linux' : 'windows';
  const fallbackName = platform === 'macos' ? 'New Mac' : platform === 'linux' ? 'New Linux host' : 'New Windows PC';
  const device = {
    id: `dev_${crypto.randomBytes(6).toString('hex')}`,
    userId: req.user.id,
    name: requestedName || fallbackName,
    platform,
    status: 'pending',
    pairCode: code,
    lastSeen: null,
    requestedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  db.devices.push(device);
  save();
  return res.status(201).json(device);
});

app.get('/api/devices/:id', auth, (req, res) => {
  const device = ownedDevice(req.user, req.params.id);
  if (!device) return res.status(404).json({ message: 'That computer is not paired.' });
  return res.json(device);
});

app.patch('/api/devices/:id', auth, (req, res) => {
  const device = ownedDevice(req.user, req.params.id);
  if (!device) return res.status(404).json({ message: 'That computer is not paired.' });
  const name = String(req.body?.name || '').trim();
  if (name) device.name = name;
  save();
  return res.json(device);
});

app.post('/api/devices/:id/approve', auth, (req, res) => {
  const device = ownedDevice(req.user, req.params.id);
  if (!device) return res.status(404).json({ message: 'That request has gone.' });
  device.status = 'paired';
  device.lastSeen = new Date().toISOString();
  delete device.requestedAt;
  save();
  return res.json(device);
});

app.post('/api/devices/:id/decline', auth, (req, res) => {
  const index = db.devices.findIndex(
    (device) => device.id === req.params.id && device.userId === req.user.id
  );
  if (index === -1) return res.status(404).json({ message: 'That request has gone.' });
  db.devices.splice(index, 1);
  save();
  return res.json({ ok: true });
});

app.delete('/api/devices/:id', auth, (req, res) => {
  const index = db.devices.findIndex(
    (device) => device.id === req.params.id && device.userId === req.user.id
  );
  if (index === -1) return res.status(404).json({ message: 'That computer is not paired.' });
  db.devices.splice(index, 1);
  save();
  return res.json({ ok: true });
});

/* ------------------------------------------------------------------- rooms */

const prunePeers = (room) => {
  const cutoff = Date.now() - PEER_TTL_MS;
  for (const [id, peer] of room.peers) {
    if (peer.lastSeen < cutoff) room.peers.delete(id);
  }
};

const pruneRooms = () => {
  const cutoff = Date.now() - ROOM_TTL_MS;
  for (const [code, room] of rooms) {
    if (room.updatedAt < cutoff) rooms.delete(code);
  }
};

setInterval(pruneRooms, 60 * 1000).unref?.();

const peerList = (room) =>
  [...room.peers.values()].map((peer) => ({
    id: peer.id,
    name: peer.name,
    role: peer.role,
    sharing: peer.sharing,
    joinedAt: peer.joinedAt,
  }));

const findRoom = (req, res) => {
  const room = rooms.get(String(req.params.code || '').toUpperCase());
  if (!room) {
    res.status(404).json({ message: 'That room is not live.' });
    return null;
  }
  return room;
};

app.post('/api/rooms', auth, (req, res) => {
  let code = randomCode();
  while (rooms.has(code)) code = randomCode();

  const peerId = `peer_${crypto.randomBytes(5).toString('hex')}`;
  const room = {
    code,
    hostPeerId: peerId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    peers: new Map(),
    messages: [],
    nextMessage: 1,
  };
  room.peers.set(peerId, {
    id: peerId,
    name: String(req.body?.name || req.user.name || 'Host').slice(0, 40),
    role: 'host',
    sharing: false,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
  });
  rooms.set(code, room);

  res.status(201).json({ code, peerId, role: 'host' });
});

app.get('/api/rooms/:code', (req, res) => {
  const room = findRoom(req, res);
  if (!room) return;
  prunePeers(room);
  res.json({ exists: true, code: room.code, peers: room.peers.size });
});

app.post('/api/rooms/:code/join', (req, res) => {
  const room = findRoom(req, res);
  if (!room) return;
  prunePeers(room);

  const peerId = `peer_${crypto.randomBytes(5).toString('hex')}`;
  room.peers.set(peerId, {
    id: peerId,
    name: String(req.body?.name || 'Guest').slice(0, 40),
    role: 'guest',
    sharing: false,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
  });
  room.updatedAt = Date.now();

  res.json({ code: room.code, peerId, role: 'guest' });
});

app.post('/api/rooms/:code/state', (req, res) => {
  const room = findRoom(req, res);
  if (!room) return;

  const peerId = String(req.body?.peer || '');
  const peer = room.peers.get(peerId);
  if (!peer) return res.status(404).json({ message: 'You are no longer in this room.' });

  peer.lastSeen = Date.now();
  peer.sharing = Boolean(req.body?.sharing);
  room.updatedAt = Date.now();
  prunePeers(room);

  const messages = [];
  room.messages = room.messages.filter((message) => {
    const addressed = message.to === peerId || message.to === 'all';
    if (addressed) {
      messages.push(message);
      return false;
    }
    return true;
  });

  return res.json({
    code: room.code,
    role: peer.role,
    peers: peerList(room),
    messages,
  });
});

app.post('/api/rooms/:code/signal', (req, res) => {
  const room = findRoom(req, res);
  if (!room) return;

  const from = String(req.body?.peer || '');
  if (!room.peers.has(from)) return res.status(404).json({ message: 'You are no longer in this room.' });

  const to = String(req.body?.to || '');
  if (!to) return res.status(400).json({ message: 'Missing target peer.' });

  room.messages.push({
    id: room.nextMessage++,
    from,
    to,
    type: String(req.body?.type || 'signal'),
    payload: req.body?.payload ?? null,
  });
  if (room.messages.length > 400) room.messages.splice(0, room.messages.length - 400);
  room.updatedAt = Date.now();

  return res.json({ ok: true });
});

app.post('/api/rooms/:code/leave', (req, res) => {
  const room = findRoom(req, res);
  if (!room) return;
  const peerId = String(req.query.peer || '');
  room.peers.delete(peerId);
  room.messages = room.messages.filter((message) => message.from !== peerId && message.to !== peerId);
  if (![...room.peers.values()].some((peer) => peer.role === 'host')) {
    rooms.delete(room.code);
  }
  return res.json({ ok: true });
});

app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'Unknown endpoint.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[beam-api] listening on http://0.0.0.0:${PORT}`);
});
