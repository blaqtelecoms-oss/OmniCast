#!/usr/bin/env node
/**
 * OmniCast helper — gives the person helping you real keyboard and mouse control
 * over this computer, for as long as control is handed to them.
 *
 * Run it only on a machine you own, and only when you accept a session.
 * Ctrl+C (or "Revoke access" in the browser) stops it immediately.
 *
 *   node omnicast-helper.mjs --url=<app-origin> --pair=<pairing-token>
 *
 * The pairing token only works for one session and stops working the moment
 * access is revoked. No account password or access token is stored here.
 */
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

const args = Object.fromEntries(
  process.argv.slice(2).map((item) => {
    const [key, ...rest] = item.replace(/^--/, '').split('=');
    return [key, rest.join('=')];
  })
);

const base = (args.url || 'https://app.base44.com').replace(/\/+$/, '');
const pair = args.pair || '';
const workDir = args.dir || join(homedir(), '.omnicast');
const isWindows = process.platform === 'win32';

if (!pair) {
  console.error('Start this through the OmniCast connection file, not directly.');
  process.exit(1);
}

mkdirSync(workDir, { recursive: true });

async function relay(payload) {
  const res = await fetch(`${base}/functions/helperRelay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: pair, ...payload }),
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 401) return { unauthorized: true };
  if (!res.ok) throw new Error(`relay failed with HTTP ${res.status}`);
  return res.json();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- Windows: built-in PowerShell injector ---------------------------------
// Windows needs nothing installed to move the pointer and press keys. One
// long-lived helper reads a line per event and applies it with SendInput, so
// input lands immediately instead of waiting on a process start.
async function windowsInput() {
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

  const helper = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', scriptPath],
    { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true }
  );
  helper.stdin.on('error', () => {});
  return (input) => {
    try {
      helper.stdin.write(`${JSON.stringify(input)}\n`);
    } catch (err) {
      /* helper restarting — the cloud path still delivers */
    }
  };
}

// ---- macOS and Linux: the system input driver ------------------------------
function driverInput() {
  let nut = null;
  try {
    nut = require('@nut-tree-fork/nut-js');
  } catch (err) {
    try {
      execFileSync('npm', ['install', '@nut-tree-fork/nut-js', '--no-fund', '--no-audit', '--silent'], {
        cwd: workDir,
        stdio: 'ignore',
      });
      nut = require('@nut-tree-fork/nut-js');
    } catch (installErr) {
      return null;
    }
  }

  const { mouse, keyboard, Key, Point, screen } = nut;

  // nut.js waits 100 ms per action and glides the pointer by default, which
  // turns a burst of clicks into seconds of drift. Both off.
  mouse.config.autoDelayMs = 0;
  mouse.config.mouseSpeed = 100000;
  keyboard.config.autoDelayMs = 0;

  const SPECIAL = {
    Enter: Key.Enter,
    Backspace: Key.Backspace,
    Tab: Key.Tab,
    Escape: Key.Escape,
    Delete: Key.Delete,
    ArrowUp: Key.Up,
    ArrowDown: Key.Down,
    ArrowLeft: Key.Left,
    ArrowRight: Key.Right,
    Home: Key.Home,
    End: Key.End,
    PageUp: Key.PageUp,
    PageDown: Key.PageDown,
    ' ': Key.Space,
  };

  let box = null;
  const size = async () => {
    if (!box) box = { w: await screen.width(), h: await screen.height() };
    return box;
  };

  const toPoint = async (x, y) => {
    const dims = await size();
    return new Point(
      Math.min(Math.max(Math.round(x * dims.w), 0), dims.w - 1),
      Math.min(Math.max(Math.round(y * dims.h), 0), dims.h - 1)
    );
  };

  const keyFor = (name) => {
    if (SPECIAL[name]) return SPECIAL[name];
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

const seen = new Set();
let running = true;
let paired = false;

process.on('SIGINT', () => {
  running = false;
  console.log('\nHelper stopped — this computer no longer accepts input.');
  process.exit(0);
});

(async () => {
  let apply = null;
  try {
    apply = isWindows ? await windowsInput() : driverInput();
  } catch (err) {
    apply = null;
  }

  if (!apply) {
    console.error('Input control is not available on this computer.');
    if (process.platform === 'linux') {
      console.error('  Linux needs an X11 session plus libxtst: sudo apt install libxtst6, then reopen this file.');
    } else {
      console.error('  Allow Accessibility for the companion in System Settings > Privacy & Security, then reopen this file.');
    }
  }

  let lastPing = 0;
  let controlling = false;

  while (running) {
    try {
      const ping = Date.now() - lastPing > 5000;
      if (ping) lastPing = Date.now();

      const reply = await relay(ping ? { ping: true } : {});

      if (reply.unauthorized) {
        console.error('This connection is no longer valid. Start a new one in the browser.');
        break;
      }
      if (reply.revoked) {
        console.log('Access was revoked. Stopping — no input is accepted any more.');
        break;
      }

      if (!paired) {
        console.log('Paired. Keep this window open for the whole session.');
        paired = true;
      }

      controlling = Boolean(reply.control);
      if (controlling && apply && reply.inputs?.length) {
        let batch = reply.inputs.filter((item) => !seen.has(item.id));
        const lastMove = batch.map((item) => item.kind).lastIndexOf('move');
        // Only the newest pointer position matters — a trail of moves would
        // hold up the click queued behind it.
        batch = batch.filter((item, index) => item.kind !== 'move' || index === lastMove);
        for (const item of batch) {
          seen.add(item.id);
          try {
            await apply(item);
          } catch (err) {
            console.error('Could not apply incoming input:', String(err?.message || err));
          }
        }
      }
    } catch (err) {
      console.error('Reconnecting…', String(err?.message || err));
      await sleep(1500);
    }
    await sleep(controlling ? 60 : 500);
  }
})();
