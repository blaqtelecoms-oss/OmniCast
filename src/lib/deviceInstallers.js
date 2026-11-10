/**
 * Builds one-click companion installers for each desktop platform.
 *
 * Each installer embeds the app origin and a single-use pairing secret, so the
 * person installing never copies, pastes or types anything: they open the file,
 * it prepares the runtime on its own, installs the companion, registers it to
 * start at sign-in and pairs the computer to this account. The secret is
 * consumed on the first registration and cannot be reused.
 */

const NODE_VERSION = 'v20.18.1';

export const PLATFORMS = [
  {
    id: 'windows',
    name: 'Windows',
    detail: 'Windows 10 and 11',
    file: 'OmniCast-Setup.cmd',
    shell: 'Task Scheduler (starts at sign-in)',
  },
  {
    id: 'macos',
    name: 'macOS',
    detail: 'macOS 12 and later',
    file: 'OmniCast-Setup.command',
    shell: 'LaunchAgent (starts at login)',
  },
  {
    id: 'linux',
    name: 'Linux',
    detail: 'GNOME, KDE and other desktops',
    file: 'omnicast-setup.sh',
    shell: 'systemd user service',
  },
];

const clean = (origin) => String(origin || '').replace(/\/+$/, '');

// The app origin serves the companion file; the backend base is where its relay
// (the Supabase functions) answers. They are different hosts.
const backend = (config) => clean(config.api || config.origin);

function windowsInstaller(config) {
  const { origin, deviceCode, pairSecret } = config;
  const script = `@echo off
chcp 65001 >nul
title OmniCast setup
setlocal EnableExtensions EnableDelayedExpansion
set "APP=${clean(origin)}"
set "API=${backend(config)}"
set "DEVICE=${deviceCode}"
set "PAIR=${pairSecret}"
set "TARGET=%LOCALAPPDATA%\\OmniCast"
set "ZIP=%LOCALAPPDATA%\\OmniCast\\runtime.zip"
set "VER=${NODE_VERSION}"

echo.
echo   OmniCast - setting up this computer
echo   ----------------------------------
echo   Nothing to type. This window closes by itself.
echo.

if not exist "%TARGET%" mkdir "%TARGET%"

set "NODE=%TARGET%\\node-%VER%-win-x64\\node.exe"
if exist "!NODE!" (
  echo   [1/3] Runtime present.
) else (
  echo   [1/3] Preparing this computer, about a minute...
  curl -fsSL -o "%ZIP%" "https://nodejs.org/dist/%VER%/node-%VER%-win-x64.zip"
  if not exist "%ZIP%" (
    echo   Could not reach the internet. Check the connection and open this file again.
    timeout /t 12 >nul
    exit /b 1
  )
  tar -xf "%ZIP%" -C "%TARGET%" >nul 2>nul
  if not exist "!NODE!" powershell -NoProfile -Command "Expand-Archive -Force '%ZIP%' '%TARGET%'" >nul 2>nul
  del "%ZIP%" >nul 2>nul
)
if not exist "%NODE%" (
  echo   Setup could not prepare the runtime. This computer is not connected.
  pause
  exit /b 1
)

echo   [2/3] Downloading the companion...
curl -fsSL -o "%TARGET%\\agent.mjs" "%APP%/omnicast-agent.mjs"
if errorlevel 1 (
  echo   Could not download the companion. This computer is not connected.
  pause
  exit /b 1
)
if not exist "%TARGET%\\agent.mjs" (
  echo   Could not download the companion. Check the connection and open this file again.
  timeout /t 12 >nul
  exit /b 1
)

echo   [3/3] Registering this computer...
> "%TARGET%\\run.cmd" echo @echo off
>> "%TARGET%\\run.cmd" echo "%NODE%" "%TARGET%\\agent.mjs" --url=%APP% --api=%API% --device=%DEVICE% --pair=%PAIR% --dir="%TARGET%" ^> "%TARGET%\\companion.log" 2^>^&1

rem Launched through Windows Script Host so the companion never shows a window.
> "%TARGET%\\run.vbs" echo Set sh = CreateObject("WScript.Shell")
>> "%TARGET%\\run.vbs" echo sh.Run """%TARGET%\\run.cmd""", 0, False

schtasks /End /TN "OmniCast Companion" >nul 2>nul
rem A copy started by hand from a terminal also holds the local port, so the page
rem would keep talking to the old one. Stop every companion before starting this one.
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*agent.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>nul
schtasks /Create /F /SC ONLOGON /TN "OmniCast Companion" /TR "wscript.exe \\"%TARGET%\\run.vbs\\"" /RL LIMITED >nul 2>nul
if errorlevel 1 (
  rem Per-user startup does not need administrator permissions.
  copy /Y "%TARGET%\\run.vbs" "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\OmniCast Companion.vbs" >nul
) else (
  del "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\OmniCast Companion.vbs" >nul 2>nul
)
rem Start directly: a failed scheduled-task registration must not prevent pairing.
del "%TARGET%\\connected-%DEVICE%.json" >nul 2>nul
wscript.exe "%TARGET%\\run.vbs"
echo   Waiting for OmniCast to confirm the connection...
set "CONFIRMED="
for /L %%I in (1,1,90) do (
  if exist "%TARGET%\\connected-%DEVICE%.json" set "CONFIRMED=marker"
  findstr /C:"confirmed device ID" "%TARGET%\\companion.log" >nul 2>nul && set "CONFIRMED=log"
  if defined CONFIRMED goto connected
  timeout /t 1 /nobreak >nul
)
echo.
echo   OmniCast has NOT confirmed this computer. Setup did not complete.
echo   Connection details:
type "%TARGET%\\companion.log"
echo.
pause
exit /b 1

:connected
echo.
if exist "%TARGET%\\connected-%DEVICE%.json" (
  echo   Connected. OmniCast confirmed this computer's device ID:
  type "%TARGET%\\connected-%DEVICE%.json"
) else (
  echo   Connected. OmniCast confirmed this computer:
  findstr /C:"confirmed device ID" "%TARGET%\\companion.log"
)
echo.
echo   The companion is running in the background.
timeout /t 8 >nul
exit /b 0
`;
  // Windows needs CRLF: with bare LF endings cmd mis-parses blocks and labels.
  return script.replace(/\r?\n/g, '\r\n');
}

function unixInstaller(config) {
  const { origin, deviceCode, pairSecret } = config;
  return `#!/bin/bash
# OmniCast setup - open this file to set up this computer. Nothing to type.
set -u

APP="${clean(origin)}"
API="${backend(config)}"
DEVICE="${deviceCode}"
PAIR="${pairSecret}"
VER="${NODE_VERSION}"
TARGET="$HOME/.omnicast"

echo
echo "  OmniCast - setting up this computer"
echo "  ----------------------------------"
echo

mkdir -p "$TARGET"
cd "$TARGET" || exit 1

case "$(uname -s)" in
  Darwin) OS=darwin ;;
  *) OS=linux ;;
esac
case "$(uname -m)" in
  arm64|aarch64) ARCH=arm64 ;;
  *) ARCH=x64 ;;
esac

NODE_DIR="$TARGET/node-$VER-$OS-$ARCH"
if [ -x "$NODE_DIR/bin/node" ] || command -v node >/dev/null 2>&1; then
  echo "  [1/3] Runtime present."
else
  echo "  [1/3] Preparing this computer, about a minute..."
  curl -fsSL "https://nodejs.org/dist/$VER/node-$VER-$OS-$ARCH.tar.gz" -o "$TARGET/runtime.tar.gz" || {
    echo "  Could not reach the internet. Check the connection and open this file again."
    read -r -p "  Press return to close." _
    exit 1
  }
  tar -xzf "$TARGET/runtime.tar.gz" -C "$TARGET" >/dev/null 2>&1
  rm -f "$TARGET/runtime.tar.gz"
fi
[ -x "$NODE_DIR/bin/node" ] && export PATH="$NODE_DIR/bin:$PATH"

echo "  [2/3] Downloading the companion..."
curl -fsSL "$APP/omnicast-agent.mjs" -o "$TARGET/agent.mjs" || {
  echo "  Could not download the companion. Check the connection and open this file again."
  read -r -p "  Press return to close." _
  exit 1
}

echo "  [3/3] Registering this computer..."
if [ ! -d "$TARGET/node_modules/@nut-tree-fork/nut-js" ]; then
  npm install @nut-tree-fork/nut-js --no-fund --no-audit --silent >/dev/null 2>&1 || true
fi

RUN="$TARGET/run.sh"
printf '#!/bin/bash\\nexport PATH="%s/node-%s-%s-%s/bin:$PATH"\\nexec node "%s/agent.mjs" --url=%s --api=%s --device=%s --pair=%s --dir="%s"\\n' \\
  "$TARGET" "$VER" "$OS" "$ARCH" \\
  "$TARGET" "$APP" "$API" "$DEVICE" "$PAIR" "$TARGET" > "$RUN"
chmod +x "$RUN"

# A copy started by hand from a terminal also holds the local port, so the page
# would keep talking to the old one. Stop every companion before starting this one.
pkill -f "agent.mjs --url=" >/dev/null 2>&1 || true

if [ "$(uname)" = "Darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/com.omnicast.companion.plist"
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.omnicast.companion</string>
  <key>ProgramArguments</key>
  <array>
    <string>$TARGET/run.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$TARGET/companion.log</string>
  <key>StandardErrorPath</key><string>$TARGET/companion.log</string>
</dict>
</plist>
PLISTEOF
  launchctl unload "$PLIST" 2>/dev/null
  launchctl load "$PLIST"
  echo
  echo "  Done. macOS will ask for Accessibility and Screen Recording access for the"
  echo "  companion - allow both so it can click and type on this Mac."
else
  UNIT="$HOME/.config/systemd/user/omnicast-companion.service"
  mkdir -p "$HOME/.config/systemd/user"
  cat > "$UNIT" <<UNITEOF
[Unit]
Description=OmniCast companion (remote control for this computer)

[Service]
ExecStart=$TARGET/run.sh
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
UNITEOF
  systemctl --user daemon-reload
  systemctl --user enable --now omnicast-companion.service
  echo
  echo "  Done. The companion now starts with your desktop session."
fi

echo "  This computer is paired and ready in OmniCast."
echo
read -r -p "  Press return to close." _
`;
}

/**
 * One-session helper launch for a help room: a single file the person opens,
 * with the pairing token already inside, so nothing is ever typed.
 */
function windowsHelper(config) {
  const { origin, token } = config;
  const script = `@echo off
chcp 65001 >nul
title OmniCast - connecting this computer
setlocal EnableExtensions EnableDelayedExpansion
set "APP=${clean(origin)}"
set "API=${backend(config)}"
set "PAIR=${token}"
set "TARGET=%LOCALAPPDATA%\\OmniCast"
set "ZIP=%LOCALAPPDATA%\\OmniCast\\runtime.zip"
set "VER=${NODE_VERSION}"

echo.
echo   OmniCast - connecting this computer
echo   ----------------------------------
echo   Nothing to type. Leave this window open for the session.
echo.

if not exist "%TARGET%" mkdir "%TARGET%"

set "NODE=%TARGET%\\node-%VER%-win-x64\\node.exe"
if not exist "!NODE!" (
  echo   Preparing this computer, about a minute...
  curl -fsSL -o "%ZIP%" "https://nodejs.org/dist/%VER%/node-%VER%-win-x64.zip"
  tar -xf "%ZIP%" -C "%TARGET%" >nul 2>nul
  if not exist "!NODE!" powershell -NoProfile -Command "Expand-Archive -Force '%ZIP%' '%TARGET%'" >nul 2>nul
  del "%ZIP%" >nul 2>nul
)

curl -fsSL -o "%TARGET%\\helper.mjs" "%APP%/omnicast-helper.mjs"
if not exist "%TARGET%\\helper.mjs" (
  echo   Could not reach the internet. Check the connection and open this file again.
  timeout /t 12 >nul
  exit /b 1
)

"%NODE%" "%TARGET%\\helper.mjs" --url=%APP% --api=%API% --pair=%PAIR%
pause
`;
  return script.replace(/\r?\n/g, '\r\n');
}

function unixHelper(config) {
  const { origin, token } = config;
  return `#!/bin/bash
# OmniCast - open this file to let the other person control this computer.
set -u
APP="${clean(origin)}"
API="${backend(config)}"
PAIR="${token}"
VER="${NODE_VERSION}"
DIR="$HOME/.omnicast"
mkdir -p "$DIR"
cd "$DIR" || exit 1

case "$(uname -s)" in
  Darwin) OS=darwin ;;
  *) OS=linux ;;
esac
case "$(uname -m)" in
  arm64|aarch64) ARCH=arm64 ;;
  *) ARCH=x64 ;;
esac

NODE_DIR="$DIR/node-$VER-$OS-$ARCH"
if [ ! -x "$NODE_DIR/bin/node" ] && ! command -v node >/dev/null 2>&1; then
  echo "Preparing this computer, about a minute..."
  curl -fsSL "https://nodejs.org/dist/$VER/node-$VER-$OS-$ARCH.tar.gz" -o "$DIR/runtime.tar.gz" || {
    echo "Could not reach the internet. Check the connection and open this file again."
    read -r -p "Press return to close." _
    exit 1
  }
  tar -xzf "$DIR/runtime.tar.gz" -C "$DIR" >/dev/null 2>&1
  rm -f "$DIR/runtime.tar.gz"
fi
[ -x "$NODE_DIR/bin/node" ] && export PATH="$NODE_DIR/bin:$PATH"

if [ ! -d "$DIR/node_modules/@nut-tree-fork/nut-js" ]; then
  npm install @nut-tree-fork/nut-js --no-fund --no-audit --silent >/dev/null 2>&1 || true
fi

curl -fsSL "$APP/omnicast-helper.mjs" -o "$DIR/helper.mjs" || {
  echo "Could not download the connection. Check the internet and open this file again."
  read -r -p "Press return to close." _
  exit 1
}

node "$DIR/helper.mjs" --url="$APP" --api="$API" --pair="$PAIR"
`;
}

export function buildHelperInstaller(platform, config) {
  return platform === 'windows' ? windowsHelper(config) : unixHelper(config);
}

export function helperFileName(platform) {
  return platform === 'windows' ? 'OmniCast-Connect.cmd' : 'OmniCast-Connect.command';
}

export function buildInstaller(platform, config) {
  return platform === 'windows' ? windowsInstaller(config) : unixInstaller(config);
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

export function detectPlatform() {
  const ua = navigator.userAgent || '';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macos';
  if (/Linux|X11/i.test(ua)) return 'linux';
  return 'windows';
}

export function randomDeviceCode() {
  return String(Math.floor(100000000 + Math.random() * 900000000));
}

export function randomPairSecret() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}