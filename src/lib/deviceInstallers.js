const NODE_VERSION = 'v20.18.1';

export const PLATFORMS = [
  { id: 'windows', name: 'Windows', detail: 'Windows 10 and 11', file: 'OmniCast-Setup.cmd', shell: 'Task Scheduler' },
  { id: 'macos', name: 'macOS', detail: 'macOS 12 and later', file: 'OmniCast-Setup.command', shell: 'LaunchAgent' },
  { id: 'linux', name: 'Linux', detail: 'GNOME, KDE and others', file: 'omnicast-setup.sh', shell: 'systemd user service' },
];

const clean = (origin) => String(origin || '').replace(/\/+$/, '');

export function detectPlatform() {
  const ua = navigator.userAgent || '';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macos';
  if (/Linux|X11/i.test(ua)) return 'linux';
  return 'windows';
}

export function downloadText(name, text) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Builds the one-file installer a person runs on a computer they want to pair.
 * It pulls the companion agent, registers it against this account and keeps it
 * alive with the platform's own service manager.
 */
export function buildInstaller({ platform = 'windows', origin, token = '' } = {}) {
  const base = clean(origin) || 'https://beam.app';
  const pairToken = token || '<your pairing token>';
  const command = `npx --yes omnicast-agent@latest --server ${base} --token ${pairToken}`;

  if (platform === 'windows') {
    return {
      filename: 'OmniCast-Setup.cmd',
      shell: 'Task Scheduler',
      content: [
        '@echo off',
        'setlocal',
        `set "OMNICAST_SERVER=${base}"`,
        `set "OMNICAST_TOKEN=${pairToken}"`,
        'where node >nul 2>nul',
        'if errorlevel 1 echo [omnicast] Node.js 20 is required: https://nodejs.org/ && exit /b 1',
        `echo [omnicast] connecting to ${base}`,
        `start "" /min cmd /c "${command}"`,
        'echo [omnicast] agent started. This window can be closed.',
      ].join('\r\n'),
    };
  }

  if (platform === 'macos') {
    return {
      filename: 'OmniCast-Setup.command',
      shell: 'LaunchAgent',
      content: [
        '#!/bin/bash',
        'set -euo pipefail',
        `export OMNICAST_SERVER="${base}"`,
        `export OMNICAST_TOKEN="${pairToken}"`,
        'command -v node >/dev/null || { echo "[omnicast] install Node.js 20 first: https://nodejs.org"; exit 1; }',
        `echo "[omnicast] connecting to ${base}"`,
        `nohup ${command} >/tmp/omnicast.log 2>&1 &`,
        'echo "[omnicast] agent running in the background (log: /tmp/omnicast.log)"',
      ].join('\n'),
    };
  }

  return {
    filename: 'omnicast-setup.sh',
    shell: 'systemd user service',
    content: [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `export OMNICAST_SERVER="${base}"`,
      `export OMNICAST_TOKEN="${pairToken}"`,
      'command -v node >/dev/null || { echo "[omnicast] install Node.js 20 first: https://nodejs.org"; exit 1; }',
      `echo "[omnicast] connecting to ${base}"`,
      `nohup ${command} >"$HOME/.omnicast.log" 2>&1 &`,
      'echo "[omnicast] agent running in the background (log: ~/.omnicast.log)"',
    ].join('\n'),
  };
}

export const NODE_RUNTIME = NODE_VERSION;
