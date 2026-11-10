#!/usr/bin/env node
/**
 * OmniCast companion — runs on the computer being controlled.
 *
 * Installed once by the OmniCast installer, then started at sign-in. It pairs
 * itself with the app on first run, keeps a heartbeat going, and applies the
 * mouse and keyboard input that the person you approved sends from their
 * browser. It never accepts input while control sits with the owner, and it
 * stops for good when access is revoked.
 *
 *   node omnicast-agent.mjs --url=<app-origin> --device=<record-id> --pair=<pairing-secret>
 */
import { createRequire } from 'node:module';
import { execFileSync, exec } from 'node:child_process';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir, release, type } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const args = Object.fromEntries(
  process.argv.slice(2).map((item) => {
    const [key, ...rest] = item.replace(/^--/, '').split('=');
    return [key, rest.join('=')];
  })
);

const base = (args.url || '').replace(/\/+$/, '');
// Where the app's backend lives (its Supabase project). The page is served from
// `url`; the relay lives here.
const api = (args.api || args.url || '').replace(/\/+$/, '');
// The one website allowed to talk to this relay: the app this computer paired with.
const appOrigin = (() => {
  try {
    return new URL(base).origin;
  } catch (err) {
    return '';
  }
})();
let recordId = args.device || '';
const pairSecret = args.pair || '';
const VERSION = '2.4.0';
const workDir = args.dir || join(homedir(), '.omnicast');

if (!base || !recordId) {
  console.error('Start this through the OmniCast installer, not directly.');
  process.exit(1);
}

mkdirSync(workDir, { recursive: true });
const configPath = join(workDir, 'device.json');

const loadConfig = () => {
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (err) {
    return {};
  }
};

const saveConfig = (data) => {
  writeFileSync(configPath, `${JSON.stringify(data, null, 2)}\n`);
  try {
    chmodSync(configPath, 0o600);
  } catch (err) {
    /* best effort on platforms without POSIX modes */
  }
};

const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';
const label = `OmniCast on ${type()}`;

let nut = null;
function loadDriver() {
  try {
    return require('@nut-tree-fork/nut-js');
  } catch (err) {
    console.log('Installing the input driver (one time)…');
    execFileSync('npm', ['install', '@nut-tree-fork/nut-js', '--no-fund', '--no-audit'], {
      cwd: workDir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    return require('@nut-tree-fork/nut-js');
  }
}

async function call(payload) {
  const res = await fetch(`${api}/functions/v1/device-service`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12000),
  });
  const data = await res.json().catch(() => null);
  if (!data) throw new Error('The app did not return a pairing response. Download a fresh installer from OmniCast.');
  if (res.status === 401 || res.status === 403) return { ...data, unauthorized: true, status: res.status };
  if (!res.ok) {
    const error = new Error(data.error || `relay failed with HTTP ${res.status}`);
    error.retryAfterMs = res.status === 429 ? Math.max(60000, Number(res.headers.get('Retry-After') || 0) * 1000) : 10000;
    throw error;
  }
  return data;
}

async function identity() {
  const config = loadConfig();
  const sameApp = !config.origin || config.origin === base;
  if (config.device_id && config.secret && sameApp) {
    if (config.record_id === recordId) return config;
    // Older installations did not bind saved credentials to their pairing record.
    // Verify them against THIS installer before using them, never another device's ID.
    if (!config.record_id) {
      const verified = await call({ action: 'poll', id: recordId, device_id: config.device_id, secret: config.secret, ping: true });
      if (!verified.unauthorized && !verified.revoked && verified.record_id === recordId) {
        const migrated = { ...config, record_id: recordId, origin: base };
        saveConfig(migrated);
        return migrated;
      }
    }
  }

  const reply = await call({
    action: 'register',
    id: recordId,
    pair_secret: pairSecret,
    platform,
    label,
    os_detail: `${type()} ${release()}`,
    version: VERSION,
  });
  if (!reply || !reply.secret) {
    throw new Error(reply?.error || 'pairing failed — open the app and download the installer again');
  }
  const next = { record_id: recordId, origin: base, device_id: reply.device_id, secret: reply.secret };
  saveConfig(next);
  return next;
}

const SPECIAL = {
  Enter: 'Enter',
  Backspace: 'Backspace',
  Tab: 'Tab',
  Escape: 'Escape',
  Delete: 'Delete',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ' ': 'Space',
};

function build(device) {
  const { mouse, keyboard, Key, Point, screen } = device;

  // nut.js waits 100 ms per action and glides the pointer at 1000 px/s by default,
  // which turns a queue of clicks into seconds of drift. Both off.
  mouse.config.autoDelayMs = 0;
  mouse.config.mouseSpeed = 100000;
  keyboard.config.autoDelayMs = 0;

  let box = null;

  const size = async () => {
    if (!box) box = { w: await screen.width(), h: await screen.height() };
    return box;
  };

  const toPoint = async (x, y) => {
    const { w, h } = await size();
    return new Point(
      Math.min(Math.max(Math.round(x * w), 0), w - 1),
      Math.min(Math.max(Math.round(y * h), 0), h - 1)
    );
  };

  const keyFor = (name) => {
    if (SPECIAL[name]) return Key[SPECIAL[name]];
    if (/^[a-zA-Z]$/.test(name)) return Key[name.toUpperCase()];
    if (/^[0-9]$/.test(name)) return Key[`Num${name}`];
    return null;
  };

  return async (input) => {
    if (input.kind === 'move' && typeof input.x === 'number') {
      await mouse.setPosition(await toPoint(input.x, input.y));
      return;
    }
    if (input.kind === 'click' && typeof input.x === 'number') {
      await mouse.setPosition(await toPoint(input.x, input.y));
      if (input.payload === 'right') await mouse.rightClick();
      else await mouse.leftClick();
      return;
    }
    if (input.kind === 'scroll') {
      const steps = Number(input.payload) || 0;
      if (steps > 0) await mouse.scrollDown(steps);
      else if (steps < 0) await mouse.scrollUp(Math.abs(steps));
      return;
    }
    if (input.kind === 'key' && input.payload) {
      let parsed = null;
      try {
        parsed = JSON.parse(input.payload);
      } catch (err) {
        return;
      }
      const name = parsed.k || '';
      const mods = [];
      if (parsed.c) mods.push(Key.LeftControl);
      if (parsed.s) mods.push(Key.LeftShift);
      if (parsed.a) mods.push(Key.LeftAlt);
      const key = keyFor(name);
      if (!key) {
        if (name.length === 1 && !parsed.c && !parsed.a) await keyboard.type(name);
        return;
      }
      await keyboard.pressKey(...(mods.length ? [...mods, key] : [key]));
      await keyboard.releaseKey(...(mods.length ? [...mods, key] : [key]));
    }
  };
}

// ---- Windows input: built in, no driver package -----------------------------
// Windows already ships everything needed to move the pointer and press keys.
// One long-lived PowerShell helper reads a single line per event and drives
// SendInput directly, so a click lands in well under a millisecond instead of
// waiting on a process start or a driver package install.
async function windowsInputScript() {
  const scriptPath = join(workDir, 'input.ps1');
  try {
    const res = await fetch(`${base}/omnicast-input.ps1`, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const text = await res.text();
      if (text.includes('OmniIn')) writeFileSync(scriptPath, text);
    }
  } catch (err) {
    /* offline — the copy already on disk still works */
  }
  if (!existsSync(scriptPath)) throw new Error('the input helper could not be downloaded');
  return scriptPath;
}

// A helper that dies, or is not allowed to touch the pointer, must never leave this
// computer looking ready while every click goes nowhere. So it is supervised: it
// announces itself, moves the pointer and reads the position back, and it is
// replaced when it stops.
let injectorScript = '';
let injector = null;
let inputVerified = false;
let injectorNote = '';
let injectorRestartedAt = 0;
let injectorStarting = false;

function spawnInjector(scriptPath) {
  const state = { alive: true, ready: false, tested: false, note: '', log: '', helper: null };
  let helper = null;
  try {
    helper = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', scriptPath],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }
    );
  } catch (err) {
    state.alive = false;
    state.note = String(err?.message || err);
    return state;
  }
  state.helper = helper;
  helper.on('error', (err) => {
    state.alive = false;
    state.note = String(err?.message || err);
  });
  helper.on('exit', () => {
    state.alive = false;
  });
  helper.stdin.on('error', () => {
    state.alive = false;
  });
  helper.stdout.setEncoding('utf8');
  helper.stdout.on('data', (chunk) => {
    state.log = (state.log + String(chunk)).slice(-600);
    if (state.log.includes('OmniIn-ready')) state.ready = true;
    if (state.log.includes('OmniIn-test ok')) {
      state.tested = true;
      inputVerified = true;
      injectorNote = '';
    }
    if (state.log.includes('OmniIn-test blocked')) {
      state.tested = true;
      inputVerified = false;
      injectorNote =
        'Windows did not let the companion move the pointer on this computer. Restart the companion, and if it keeps happening run the installer again.';
    }
  });
  helper.stderr.setEncoding('utf8');
  helper.stderr.on('data', (chunk) => {
    state.note = String(chunk).trim().slice(-240) || state.note;
  });
  return state;
}

function injectorWrite(state, input) {
  if (!state?.alive || !state.helper) return false;
  try {
    state.helper.stdin.write(`${JSON.stringify(input)}\n`);
    return true;
  } catch (err) {
    state.alive = false;
    return false;
  }
}

/** One process per event — only used when the long-lived helper is not answering. */
function injectOnce(scriptPath, input) {
  return new Promise((resolve) => {
    let child = null;
    try {
      child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', scriptPath],
        { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true }
      );
    } catch (err) {
      resolve(false);
      return;
    }
    child.on('error', () => resolve(false));
    child.on('exit', () => resolve(true));
    child.stdin.on('error', () => {});
    try {
      child.stdin.write(`${JSON.stringify(input)}\n`);
      child.stdin.end();
    } catch (err) {
      resolve(false);
    }
  });
}

/** Starts the helper and waits until it says it is ready and can really move the pointer. */
async function startWindowsInjector() {
  if (injectorStarting) return;
  injectorStarting = true;
  try {
  injectorScript = await windowsInputScript();
  injector = spawnInjector(injectorScript);
  const readyUntil = Date.now() + 20000;
  while (injector.alive && !injector.ready && Date.now() < readyUntil) await sleep(200);
  if (!injector.alive || !injector.ready) {
    inputVerified = false;
    if (!injectorNote) {
      injectorNote = injector.note
        ? `The input helper on this computer did not start: ${injector.note}`
        : 'The input helper on this computer did not start. Run the installer again.';
    }
    return;
  }
  injectorWrite(injector, { kind: 'probe' });
  const testUntil = Date.now() + 6000;
  while (injector.alive && !injector.tested && Date.now() < testUntil) await sleep(150);
  if (!injector.tested) {
    inputVerified = false;
    injectorNote = 'The input helper on this computer stopped before it could test itself. Run the installer again.';
  }
  } finally {
    injectorStarting = false;
  }
}
/** Hands one event to the live helper; never starts a process just to move the pointer. */
function windowsApply(input) {
  if (injector?.alive && injectorWrite(injector, input)) return;
  if (input.kind === 'move' || !injectorScript) return;
  injectOnce(injectorScript, input).catch(() => {});
}

// ---- native screen capture -------------------------------------------------
// The screen is grabbed on this computer itself, so nobody has to pick a tab in
// a browser window to share it. Windows uses one long-lived PowerShell helper
// with GDI+; macOS uses screencapture; Linux uses ImageMagick or scrot.
let captureReady = false;
// The Windows capture helper is a process like any other: when it stops, this
// computer can no longer be shared from, so it is reported honestly and restarted.
let captureLost = false;
let captureRestartedAt = 0;
let grabFrame = null;
let lastFrame = null;
let lastFrameAt = 0;

async function downloadHelper(name, marker) {
  const target = join(workDir, name);
  try {
    const res = await fetch(`${base}/${name}`, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const text = await res.text();
      if (text.includes(marker)) writeFileSync(target, text);
    }
  } catch (err) {
    /* offline — the copy already on disk still works */
  }
  if (!existsSync(target)) throw new Error(`${name} could not be downloaded`);
  return target;
}

async function startWindowsCapture() {
  const scriptPath = await downloadHelper('omnicast-screen.ps1', 'OmniScreen');
  captureLost = false;
  const helper = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', scriptPath],
    { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true }
  );
  helper.on('error', (err) => {
    captureLost = true;
    console.error('Screen helper failed:', String(err?.message || err));
  });
  helper.stdin.on('error', () => {});
  let waiting = null;
  let buffer = '';
  helper.on('exit', () => {
    captureLost = true;
    const resolve = waiting;
    waiting = null;
    if (resolve) resolve(null);
  });
  helper.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    for (let idx = buffer.indexOf('\n'); idx >= 0; idx = buffer.indexOf('\n')) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      const resolve = waiting;
      if (!resolve) continue;
      waiting = null;
      resolve(line && line !== 'ERR' ? Buffer.from(line, 'base64') : null);
    }
  });
  return () =>
    new Promise((resolve) => {
      if (!helper.stdin.writable) {
        resolve(null);
        return;
      }
      waiting = resolve;
      helper.stdin.write('grab\n');
    });
}

const runCapture = (file, callArgs) =>
  new Promise((resolve) => {
    execFile(file, callArgs, { maxBuffer: 32 * 1024 * 1024, encoding: 'buffer' }, (err, stdout) => {
      resolve(err ? null : stdout && stdout.length ? stdout : null);
    });
  });

async function macCapture() {
  const target = join(workDir, 'screen.jpg');
  const ok = await new Promise((resolve) => execFile('screencapture', ['-x', '-t', 'jpg', target], (err) => resolve(!err)));
  if (!ok) throw new Error('screencapture failed — allow Screen Recording for the companion');
  return readFileSync(target);
}

async function linuxCapture() {
  const direct = await runCapture('import', ['-window', 'root', '-silent', 'jpg:-']);
  if (direct) return direct;
  const target = join(workDir, 'screen.jpg');
  const ok = await new Promise((resolve) => execFile('scrot', ['-o', '-t', '60', target], (err) => resolve(!err)));
  if (!ok) throw new Error('install ImageMagick (import) or scrot so the companion can grab the screen');
  return readFileSync(target);
}

async function startScreenCapture() {
  const take =
    platform === 'windows' ? await startWindowsCapture() : platform === 'macos' ? macCapture : linuxCapture;
  // One grab at a time: a frame that failed must never hold up the next request.
  let chain = Promise.resolve(null);
  return () => {
    chain = chain.catch(() => null).then(() => take());
    return chain;
  };
}

// Answers a browser asking for the current screen on localhost. Recent frames are
// reused, so several tabs polling never stack up behind the capture itself.
async function serveFrame(req, res) {
  try {
    if (!grabFrame) throw new Error('capture is not running on this computer');
    if (!lastFrame || Date.now() - lastFrameAt > 35) {
      const next = await grabFrame();
      if (next) {
        lastFrame = next;
        lastFrameAt = Date.now();
      }
    }
    if (!lastFrame) throw new Error('the screen could not be read');
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': lastFrame.length,
      'Cache-Control': 'no-store',
    });
    res.end(lastFrame);
  } catch (err) {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: String(err?.message || err) }));
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let running = true;
let seen = new Set();
let lastSession = '';
let apply = null;
// The identity this computer paired as, kept for the page to read back.
let paired = null;
// Credentials in use. They are replaceable at runtime: when the record behind them
// is gone, the computer is paired again from the browser instead of a new download.
let creds = null;
let identityLost = false;

// What this computer can actually do, reported on every heartbeat. The app shows
// this to the owner instead of guessing from an online dot: a missing permission
// is named on the device itself rather than discovered mid-session.
function capabilities() {
  // Only a verified helper counts: claiming readiness while clicks go nowhere is
  // worse than saying plainly that this computer cannot be controlled yet.
  const working = platform === 'windows' ? Boolean(injector?.alive && inputVerified) : Boolean(apply);
  const base = { capture: captureReady && !captureLost, input: working };
  if (platform === 'linux' && (process.env.XDG_SESSION_TYPE || '').toLowerCase() === 'wayland') {
    return {
      ...base,
      readiness: 'unsupported',
      reason: 'This desktop runs Wayland, which does not allow control. Log in with an X11 session instead.',
    };
  }
  if (!working) {
    if (platform === 'windows' && injectorNote) {
      return { ...base, readiness: 'needs-permission', reason: injectorNote };
    }
    return {
      ...base,
      readiness: 'needs-permission',
      reason:
        platform === 'macos'
          ? 'Allow Accessibility for the companion in System Settings › Privacy & Security, then restart it.'
          : platform === 'linux'
            ? 'Install libxtst6, then restart the companion so it can send input.'
            : 'Input control did not start. Run the installer again.',
    };
  }
  if (!base.capture) {
    return {
      ...base,
      readiness: 'input-only',
      reason: 'Control works. Screen viewing still needs a browser tab open on this computer.',
    };
  }
  return {
    ...base,
    readiness: 'ready',
    reason: 'Screen and control both run on this computer.',
  };
}

// ---- instant input channel -------------------------------------------------
// The tab that shares this screen relays every click and key press it receives
// from the person in control straight to this process over localhost, so input
// never waits on the cloud round trip. The token is minted per run and handed
// only to the tab this companion opened.
const relayToken = randomBytes(16).toString('hex');
const RELAY_PORTS = [47823, 47824, 47825, 47826, 47827];
const pending = [];
let controlled = false;
let lastRelay = 0;
let draining = false;
let controlCheckedAt = 0;

/** Re-reads who holds control right now, without waiting for the next heartbeat. */
async function refreshControl() {
  if (!creds || identityLost) return;
  try {
    const reply = await call({
      action: 'poll',
      id: creds.record_id,
      device_id: creds.device_id,
      secret: creds.secret,
      ping: false,
      capabilities: capabilities(),
    });
    controlled = reply?.session?.control_holder === 'operator';
  } catch (err) {
    /* the heartbeat settles it a moment later */
  }
}

async function drain() {
  if (draining) return;
  draining = true;
  try {
    while (pending.length) {
      const item = pending.shift();
      // A pointer position that has already been overtaken is worthless: drop it
      // so the click queued behind it is applied immediately.
      if (item.kind === 'move' && pending.some((next) => next.kind === 'move')) continue;
      if (!apply) continue;
      // The operator presses "Take control" in their browser, which the cloud only
      // learns a moment later. Their first click must not be binned in that gap, so
      // this asks once instead of dropping the event.
      if (!controlled) {
        // Asking the cloud on every single event would turn each pointer step into a
        // round trip, which is what makes control feel sluggish.
        if (Date.now() - controlCheckedAt > 1200) {
          controlCheckedAt = Date.now();
          await refreshControl();
        }
        if (!controlled) continue;
      }
      try {
        await apply(item);
        lastRelay = Date.now();
      } catch (err) {
        console.error('Could not apply incoming input:', String(err?.message || err));
      }
    }
  } finally {
    draining = false;
  }
}

/**
 * Pairs this computer to the account of the browser that asked, keeping the number
 * it already shows. Only a page this companion opened carries the relay token, so
 * another website cannot pull this computer into an account of its own.
 */
async function adopt(payload, res) {
  const respond = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };
  try {
    const nextRecord = String(payload.record_id || '');
    const secret = String(payload.pair_secret || '');
    if (!nextRecord || !secret) throw new Error('pairing details missing');
    const reply = await call({
      action: 'register',
      id: nextRecord,
      pair_secret: secret,
      platform,
      label,
      os_detail: `${type()} ${release()}`,
      version: VERSION,
    });
    if (!reply?.secret) throw new Error(reply?.error || 'pairing failed');
    recordId = nextRecord;
    creds = { record_id: nextRecord, origin: base, device_id: reply.device_id, secret: reply.secret };
    paired = creds;
    saveConfig(creds);
    writeFileSync(
      join(workDir, `connected-${nextRecord}.json`),
      JSON.stringify({ record_id: nextRecord, device_id: reply.device_id, connected_at: new Date().toISOString() })
    );
    identityLost = false;
    console.log(`Paired again — this computer is device ${reply.device_id}.`);
    respond(200, { ok: true, device_id: reply.device_id });
  } catch (err) {
    respond(400, { error: String(err?.message || err) });
  }
}

function startInputRelay() {
  const handler = (req, res) => {
    // Only the OmniCast app may read this relay. A pairing token any website could
    // fetch would let a stranger pull this computer into an account of their own.
    const origin = String(req.headers.origin || '');
    const trusted =
      origin === appOrigin ||
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      // The app is also served from its builder preview on this same platform.
      /^https:\/\/[a-z0-9-]+\.base44\.app$/.test(origin);
    res.setHeader('Access-Control-Allow-Origin', trusted ? origin : appOrigin);
    res.setHeader('Vary', 'Origin');
    // The browser sends this as a JSON POST, which always preflights. Without the
    // methods header the preflight fails and every click is dropped before it arrives.
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    // Any browser on this computer can ask which device this companion owns, so
    // "This computer" is recognised again after a new sign-in or in another browser.
    if (req.method === 'GET') {
      if (req.url.startsWith('/frame')) {
        serveFrame(req, res);
        return;
      }
      const known = req.url.startsWith('/whoami');
      res.writeHead(known ? 200 : 404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(
        JSON.stringify(
          known
            ? {
                record_id: recordId,
                device_id: paired?.device_id || loadConfig().device_id || '',
                capture: captureReady && !captureLost,
                platform,
                label,
                paired: Boolean(creds) && !identityLost,
                version: VERSION,
                // Proof that whoever is asking reached this computer itself, so the
                // page can add it back to an account without a token in the URL.
                claim_token: relayToken,
              }
            : { error: 'not found' }
        )
      );
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(404);
      res.end();
      return;
    }
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 65536) req.destroy();
    });
    req.on('end', () => {
      let payload = null;
      try {
        payload = JSON.parse(body || '{}');
      } catch (err) {
        payload = null;
      }
      if (!payload || payload.token !== relayToken) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      if (req.url.startsWith('/adopt')) {
        adopt(payload, res);
        return;
      }
      if (!payload.input) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      pending.push(payload.input);
      drain();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  };

  for (const port of RELAY_PORTS) {
    const server = createServer(handler);
    server.on('error', () => {});
    server.listen(port, '127.0.0.1');
  }
}

// Brings the person at this computer to the one button they have to press.
let openedFor = '';
function openScreenPage(code) {
  if (!code || openedFor === code) return;
  openedFor = code;
  const url = `${base}/devices?agent=${relayToken}&device=${encodeURIComponent(recordId)}&code=${encodeURIComponent(code)}`;
  const command =
    platform === 'windows' ? `start "" "${url}"` : platform === 'macos' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(command, () => {});
}

// No account behind this computer any more: open the page where it is added back
// in one click, rather than sending anyone off to download the installer again.
let openedPairing = false;
function openPairingPage() {
  if (openedPairing) return;
  openedPairing = true;
  const url = `${base}/devices?agent=${relayToken}`;
  const command =
    platform === 'windows' ? `start "" "${url}"` : platform === 'macos' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(command, () => {});
}

process.on('SIGINT', () => {
  running = false;
  console.log('\nCompanion stopped. This computer no longer accepts input.');
  process.exit(0);
});

// Keeps installed companions on the current version, so fixes reach this computer
// without anyone downloading the installer again.
async function selfUpdate() {
  try {
    const res = await fetch(`${base}/omnicast-agent.mjs`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return false;
    const remote = await res.text();
    if (!remote.startsWith('#!')) return false;
    const here = fileURLToPath(import.meta.url);
    const local = readFileSync(here, 'utf8');
    if (remote.trim() === local.trim()) return false;
    writeFileSync(here, remote);
    console.log('Updating the companion to the newest version…');
    const child = spawn(process.execPath, process.argv.slice(1), { detached: true, stdio: 'inherit' });
    child.unref();
    process.exit(0);
  } catch (err) {
    /* offline or read-only install — carry on with the current version */
  }
  return false;
}

async function pairUp() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const me = await identity();
      const verified = await call({ action: 'poll', id: recordId, device_id: me.device_id, secret: me.secret, ping: true });
      // The record behind these credentials is gone: retrying can never fix that, so
      // hand over to the pairing page instead of looping until the process gives up.
      if (verified.unauthorized || verified.revoked) return null;
      if (verified.record_id !== recordId) {
        throw new Error(verified.error || 'This installation is no longer paired.');
      }
      writeFileSync(join(workDir, `connected-${recordId}.json`), JSON.stringify({ record_id: recordId, device_id: me.device_id, connected_at: new Date().toISOString() }));
      return me;
    } catch (err) {
      console.error('Pairing…', String(err?.message || err));
      await sleep(err.retryAfterMs || 10000);
    }
  }
  return null;
}

(async () => {
  await selfUpdate();
  // Answer the browser before pairing: the page this computer opens is where it is
  // added to an account, and that needs the relay already listening.
  startInputRelay();

  const me = await pairUp();
  creds = me;
  paired = me;
  if (me) {
    console.log(`Connected — OmniCast confirmed device ID ${me.device_id}. The companion stays running in the background.`);
  } else {
    identityLost = true;
    console.error('This computer is not paired to an account right now. The page that just opened adds it back in one click.');
    openPairingPage();
  }

  try {
    if (platform === 'windows') {
      // Started without waiting: the helper proves itself in the background so screen
      // sharing is not held up, and early clicks still land through the one-shot path.
      apply = windowsApply;
      startWindowsInjector()
        .then(() => {
          if (inputVerified) {
            console.log('Input control is ready — approved clicks and keys are applied to this computer.');
          } else {
            console.error(`Input control is NOT working on this computer: ${injectorNote}`);
          }
        })
        .catch((err) => console.error(`Input control is NOT working on this computer: ${String(err?.message || err)}`));
    } else {
      nut = loadDriver();
      apply = build(nut);
      await nut.screen.width();
      console.log('Input control is ready — approved clicks and keys are applied to this computer.');
    }
  } catch (err) {
    console.error(`Input control is NOT available on this computer: ${String(err?.message || err)}`);
    console.error(
      platform === 'linux'
        ? '  Linux needs an X11 session plus libxtst: sudo apt install libxtst6, then restart the companion.'
        : platform === 'macos'
          ? '  macOS needs Accessibility for node in System Settings > Privacy & Security, then restart the companion.'
          : '  Run the installer again, then start the companion again.'
    );
  }

  try {
    grabFrame = await startScreenCapture();
    captureReady = true;
    console.log('Screen capture is ready — this screen can be shared without a browser picker.');
  } catch (err) {
    console.error(`Screen capture is NOT available on this computer: ${String(err?.message || err)}`);
  }

  let lastPing = 0;

  while (running) {
    if (!creds || identityLost) {
      // Nothing to poll with — pairUp or the page this computer opened fills this in.
      await sleep(2000);
      continue;
    }
    try {
      const ping = Date.now() - lastPing > 30000;
      const relayFresh = Date.now() - lastRelay < 15000;
      const reply = await call({
        action: 'poll',
        id: creds.record_id,
        device_id: creds.device_id,
        secret: creds.secret,
        ping,
        local_relay: relayFresh,
        capabilities: capabilities(),
      });

      if (reply?.revoked || reply?.unauthorized) {
        console.log('This computer is no longer in the account it paired with. Nothing is accepted until it is paired again.');
        controlled = false;
        pending.length = 0;
        identityLost = true;
        openPairingPage();
        continue;
      }

      if (ping) lastPing = Date.now();
      const session = reply?.session || null;
      controlled = session?.control_holder === 'operator';

      // A helper that was killed (security software, a crashed PowerShell) is brought
      // back, so this computer does not stay unable to accept control for good.
      if (
        platform === 'windows' &&
        (!injector || !injector.alive) &&
        Date.now() - injectorRestartedAt > 15000
      ) {
        injectorRestartedAt = Date.now();
        await startWindowsInjector().catch(() => {});
      }
      // The screen helper is restarted the same way: without it this computer can
      // never share its screen again, and the page would keep waiting for frames.
      if (platform === 'windows' && captureLost && Date.now() - captureRestartedAt > 10000) {
        captureRestartedAt = Date.now();
        try {
          grabFrame = await startScreenCapture();
          captureReady = true;
          console.log('Screen capture is running again on this computer.');
        } catch (err) {
          /* tried again shortly */
        }
      }
      if (session?.id !== lastSession) {
        if (session) {
          console.log(
            session.control_holder === 'operator'
              ? `Connected — someone has control of this computer (room ${session.code}).`
              : `Connected — watching, control stays here (room ${session.code}).`
          );
        } else if (lastSession) {
          console.log('Session ended.');
        }
        lastSession = session?.id || '';
        seen = new Set();
      }

      if (session) openScreenPage(session.code);
      else if (reply.requests?.[0]?.code) openScreenPage(reply.requests[0].code);

      // While the share tab is relaying over localhost, skip the slower cloud queue entirely.
      if (apply && !relayFresh && session?.control_holder === 'operator' && reply?.inputs?.length) {
        let batch = reply.inputs.filter((input) => !seen.has(input.id));
        const lastMove = batch.map((input) => input.kind).lastIndexOf('move');
        // Keep only the newest pointer position: a trail of moves would hold up the click behind it.
        batch = batch.filter((input, index) => input.kind !== 'move' || index === lastMove);
        for (const input of batch) {
          seen.add(input.id);
          try {
            await apply(input);
          } catch (err) {
            console.error('Could not apply incoming input:', String(err?.message || err));
          }
        }
      }
    } catch (err) {
      controlled = false;
      pending.length = 0;
      console.error('Reconnecting…', String(err?.message || err));
      await sleep(err.retryAfterMs || 10000);
    }
    // Screen and input still travel instantly over WebRTC/localhost. Cloud polling
    // only discovers sessions and provides fallback input, not a per-frame transport.
    // While a session is running it runs more often, so control and queued input
    // follow a few hundred milliseconds behind the click instead of seconds.
    await sleep(lastSession ? 2500 : 5000);
  }
})();
