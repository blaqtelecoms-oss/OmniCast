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
