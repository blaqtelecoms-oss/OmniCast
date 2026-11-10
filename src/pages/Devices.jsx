import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, MonitorSmartphone, Plus } from 'lucide-react';
import useDevices from '@/components/devices/useDevices';
import ThisDeviceCard from '@/components/devices/ThisDeviceCard';
import UnpairedCompanion from '@/components/devices/UnpairedCompanion';
import DeviceCard from '@/components/devices/DeviceCard';
import InstallCompanion from '@/components/devices/InstallCompanion';
import ConnectDeviceCard from '@/components/devices/ConnectDeviceCard';
import PendingRequests from '@/components/devices/PendingRequests';
import SharePublisher from '@/components/devices/SharePublisher';
import { buildInstaller, detectPlatform, downloadText, PLATFORMS } from '@/lib/deviceInstallers';
import openLocalScreen from '@/lib/localScreen';

export default function Devices() {
  const navigate = useNavigate();
  const devices = useDevices();
  const [stream, setStream] = useState(null);
  const [notice, setNotice] = useState('');
  const [preset, setPreset] = useState('');
  // Capture takes a moment; without this the button looks like it did nothing.
  const [starting, setStarting] = useState(false);
  const skipNative = useRef(false);
  // The companion opens this page itself and passes a per-run token here, which is
  // what lets control input reach it instantly instead of going through the cloud.
  const [agentToken] = useState(
    () => new URLSearchParams(window.location.search).get('agent') || ''
  );
  const platform = detectPlatform();

  // Some setups refuse system audio; the picture is what matters here, so the
  // browser is asked for the screen alone rather than giving up on both.
  const askForScreen = async () => {
    try {
      return await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
    } catch (err) {
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') throw err;
      return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 } });
    }
  };

  const toggleShare = async () => {
    setNotice('');
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
      return;
    }
    if (starting) return;
    setStarting(true);
    try {
      // The companion grabs this screen itself, so no window picker appears. When it
      // cannot, the browser asks instead — in this same click, because asking for a
      // second click is exactly where sharing silently stops.
      const native =
        devices.runningHere?.capture && !skipNative.current
          ? await openLocalScreen(devices.runningHere.port)
          : null;
      if (!native) skipNative.current = true;
      if (!native && !navigator.mediaDevices?.getDisplayMedia) {
        setNotice(
          'This browser cannot capture a screen. Open OmniCast in Chrome or Edge on this computer, then press the button again.'
        );
        return;
      }
      const next = native || (await askForScreen());
      next.getVideoTracks()[0]?.addEventListener('ended', () => setStream(null));
      setStream(next);
    } catch (err) {
      setNotice(
        err?.name === 'NotAllowedError'
          ? 'Screen sharing was cancelled or blocked. Press the button again and choose a screen in the browser prompt.'
          : 'This computer could not share its screen. Restart the companion (or refresh this page) and try again.'
      );
    } finally {
      setStarting(false);
    }
  };

  // Once someone has been allowed in and the companion here can capture the screen
  // itself, sharing starts by itself — the person helping sees this screen straight
  // away instead of waiting for someone at this computer to press a button.
  const autoShared = useRef('');
  useEffect(() => {
    const session = devices.active;
    if (!session?.id || !devices.runningHere?.capture || stream) return;
    if (session.device_id !== devices.thisDevice?.device_id) return;
    if (autoShared.current === session.id) return;
    autoShared.current = session.id;
    toggleShare();
  }, [devices.active?.id, devices.runningHere?.capture, devices.thisDevice?.device_id, stream]);

  const [pairing, setPairing] = useState(false);
  const pairThisComputer = async () => {
    setPairing(true);
    try {
      return await devices.pairThisComputer(agentToken);
    } finally {
      setPairing(false);
    }
  };

  // The guaranteed way in: a fresh installer on this computer pairs itself, whether
  // or not the copy already here is new enough to be added from the page.
  const reinstall = async () => {
    setNotice('');
    const config = await devices.createDevice(platform);
    const meta = PLATFORMS.find((item) => item.id === platform) || PLATFORMS[0];
    downloadText(meta.file, buildInstaller(platform, config));
    setNotice(
      `The installer for ${meta.name} downloaded. Open it once on this computer — it pairs by itself and the computer shows up here.`
    );
  };

  const connect = async ({ deviceId, password }) => {
    setNotice('');
    const result = await devices.connect({ deviceId, password });
    if (typeof result === 'string') return result;
    navigate(`/device/${result.device_session_id}`);
    return '';
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="max-w-2xl">
        <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-primary">Devices</p>
        <h1 className="mt-3 font-display text-4xl leading-[1.05] tracking-tight text-foreground sm:text-5xl">
          Every computer, one flat list.
        </h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
          Install the companion once on a computer and it keeps its own device ID. Then control it
          from anywhere — with approval each time, or unattended with a password you set.
        </p>
      </header>

      {notice && (
        <p className="mt-5 rounded-xl border border-border bg-secondary/40 px-4 py-3 text-[12.5px] text-muted-foreground">
          {notice}
        </p>
      )}

      {agentToken && devices.active && !stream && (
        <p className="mt-5 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-[12.5px] text-foreground">
          Someone is connected to this computer. Press “Share this screen now” and they can take over.
        </p>
      )}

      <div className="mt-8">
        <PendingRequests requests={devices.requests} onAnswer={devices.answer} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div>
          {devices.thisDevice ? (
            <ThisDeviceCard
              device={devices.thisDevice}
              sharing={Boolean(stream)}
              starting={starting}
              onToggleShare={toggleShare}
              onSaveUnattended={(payload) => devices.saveUnattended(devices.thisDevice, payload)}
            />
          ) : devices.runningHere ? (
            <UnpairedCompanion
              number={devices.runningHere.deviceId}
              canPair={Boolean(agentToken || devices.runningHere?.token)}
              busy={pairing}
              onPair={pairThisComputer}
              onInstall={reinstall}
            />
          ) : (
            <section className="relative overflow-hidden rounded-2xl border border-border bg-card/60 p-6">
              <div className="pointer-events-none absolute inset-0 ink-glow opacity-70" />
              <div className="relative">
                <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/60">
                  <MonitorSmartphone className="h-5 w-5 text-muted-foreground" />
                </span>
                <h2 className="mt-4 text-[16px] font-medium text-foreground">
                  This computer has no device ID yet
                </h2>
                <p className="mt-2 max-w-[46ch] text-[12.5px] leading-relaxed text-muted-foreground">
                  Install the companion to give it one. After that it appears here and can be
                  controlled like any other device — no terminals, no tokens to paste.
                </p>
              </div>
            </section>
          )}
        </div>

        <div className="space-y-4">
          <InstallCompanion
            platform={platform}
            onDownload={async (target) => devices.createDevice(target)}
          />
          <ConnectDeviceCard onConnect={connect} preset={preset} />
        </div>
      </div>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-[15px] font-medium text-foreground">Your devices</h2>
          <span className="text-[11px] text-muted-foreground">
            {devices.loading ? 'Loading…' : `${devices.devices.length} paired`}
          </span>
        </div>

        {devices.loading ? (
          <div className="mt-4 flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Checking your devices…
          </div>
        ) : devices.devices.length ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {devices.devices.map((device) => (
              <DeviceCard
                key={device.id}
                device={device}
                onConnect={async (target) => {
                  const id = String(target.device_id);
                  setPreset(id);
                  // Unattended devices need a password, so hand the person to the form
                  // already filled in. Everything else connects straight away.
                  if (target.unattended_enabled) {
                    setNotice('Enter the unattended password below to connect to this computer.');
                    return;
                  }
                  try {
                    const problem = await connect({ deviceId: id, password: '' });
                    if (problem) setNotice(problem);
                  } catch (err) {
                    setNotice(err?.message || 'Could not reach that computer. Please try again.');
                  }
                }}
                onRevoke={devices.removeDevice}
              />
            ))}
          </div>
        ) : (
          <div className="mt-4 flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border px-5 py-8">
            <Plus className="h-4 w-4 text-muted-foreground" />
            <p className="max-w-[46ch] text-[12.5px] leading-relaxed text-muted-foreground">
              No devices yet. Download the companion above on any computer you want to reach and it
              will show up here with a nine-digit ID.
            </p>
          </div>
        )}
      </section>

      {stream && devices.active && (
        <SharePublisher
          sessionId={devices.active.session_id}
          stream={stream}
          agentToken={agentToken}
        />
      )}
    </div>
  );
}